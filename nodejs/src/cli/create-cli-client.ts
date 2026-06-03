/**
 * Build LoxtepClient for CLI commands: merged auth + config + dummy SigV4 for API Gateway dev.
 */

import { loadConfig } from '../config/load.js';
import { resolveCliAccessToken, type CliAuthSource } from './auth-resolve.js';
import { writeCredentials, readCredentials, getCredentialsPath } from './credentials.js';
import { TokenManager } from '../auth/token-manager.js';
import { refresh, type RefreshResponse, type AwsCredentialsSnake } from '../auth/login.js';
import { decodeJwtPayload } from '../auth/jwt.js';
import { LoxtepClient } from '../client/loxtep-client.js';

export interface CreateCliClientOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  /** After refresh, apply STS (or other) side effects; used by {@link createCliClient} for SigV4. */
  on_after_refresh?: (result: RefreshResponse) => void;
}

function jwtExpSeconds(token: string): number | undefined {
  const { exp } = decodeJwtPayload(token);
  return exp;
}

async function persistRefreshedTokens(
  source: CliAuthSource,
  access_token: string,
  refresh_token: string | undefined,
  expires_at: string | undefined,
  aws_credentials: AwsCredentialsSnake | undefined,
  options: CreateCliClientOptions
): Promise<void> {
  if (source !== 'credentials') return;
  const prev = await readCredentials(options.credentialsPath);
  await writeCredentials(
    {
      access_token,
      refresh_token,
      expires_at,
      aws_credentials: aws_credentials ?? prev?.aws_credentials,
    },
    options.credentialsPath
  );
}

export interface CliAuthContext {
  api_url: string;
  get_token: () => Promise<string | null>;
  refresh_auth: () => Promise<boolean>;
}

/**
 * Shared CLI auth: proactive refresh near JWT expiry + {@link LoxtepHttpClient} 401 retry via refresh_auth.
 */
export async function createCliAuthContext(
  options: CreateCliClientOptions = {}
): Promise<CliAuthContext | null> {
  const config = await loadConfig(options.configFilePath);
  const resolved = await resolveCliAccessToken({
    credentialsPath: options.credentialsPath,
  });
  const api_url = (config.api_url || resolved?.api_url_from_mcp || '').replace(/\/$/, '');
  if (!api_url || !resolved?.access_token) {
    return null;
  }

  const tm = new TokenManager();
  const exp = jwtExpSeconds(resolved.access_token);
  tm.setToken(resolved.access_token, resolved.refresh_token, exp);

  const source = resolved.source;
  const refreshFn = async (apiUrl: string, refreshToken: string) => {
    const r = await refresh(apiUrl, refreshToken, { auth_path_prefix: config.auth_path_prefix });
    const nextExp =
      r.expires_at != null && r.expires_at !== ''
        ? Math.floor(new Date(r.expires_at).getTime() / 1000)
        : jwtExpSeconds(r.access_token);
    tm.setToken(r.access_token, r.refresh_token ?? refreshToken, nextExp);
    await persistRefreshedTokens(
      source,
      r.access_token,
      r.refresh_token ?? refreshToken,
      r.expires_at,
      r.aws_credentials,
      options
    );
    options.on_after_refresh?.(r);
    return {
      access_token: r.access_token,
      refresh_token: r.refresh_token ?? refreshToken,
      expires_in: r.expires_in,
    };
  };

  const get_token = async (): Promise<string | null> => {
    if (source === 'env') return resolved.access_token;
    const tok = tm.getToken();
    if (!tok) return null;
    const refreshed = await tm.getTokenOrRefresh(api_url, 300, refreshFn);
    return refreshed;
  };

  const refresh_auth = async (): Promise<boolean> => {
    if (source === 'env') return false;
    const rt = tm.getRefreshToken();
    if (!rt) return false;
    try {
      await refreshFn(api_url, rt);
      return true;
    } catch {
      return false;
    }
  };

  return { api_url, get_token, refresh_auth };
}

export async function createCliClient(options: CreateCliClientOptions = {}): Promise<{
  client: LoxtepClient;
  config: Awaited<ReturnType<typeof loadConfig>>;
} | null> {
  const config = await loadConfig(options.configFilePath);
  const credsPath = options.credentialsPath ?? getCredentialsPath();
  const fileCreds = await readCredentials(credsPath);
  const cliSigv4: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  } = fileCreds?.aws_credentials
    ? {
        accessKeyId: fileCreds.aws_credentials.access_key_id,
        secretAccessKey: fileCreds.aws_credentials.secret_access_key,
        sessionToken: fileCreds.aws_credentials.session_token,
      }
    : {
        accessKeyId: 'cli',
        secretAccessKey: 'cli',
      };

  // Check if STS credentials are expired and proactively refresh
  if (fileCreds?.aws_credentials?.expiration) {
    const expMs = new Date(fileCreds.aws_credentials.expiration).getTime();
    if (expMs < Date.now()) {
      // STS expired — trigger a refresh to get fresh credentials
      const authCtxForRefresh = await createCliAuthContext(options);
      if (authCtxForRefresh) {
        const refreshed = await authCtxForRefresh.refresh_auth();
        if (refreshed) {
          // Re-read credentials file to pick up any new aws_credentials from refresh
          const refreshedCreds = await readCredentials(credsPath);
          if (refreshedCreds?.aws_credentials) {
            const exp2 = new Date(refreshedCreds.aws_credentials.expiration || 0).getTime();
            if (exp2 > Date.now()) {
              Object.assign(cliSigv4, {
                accessKeyId: refreshedCreds.aws_credentials.access_key_id,
                secretAccessKey: refreshedCreds.aws_credentials.secret_access_key,
                sessionToken: refreshedCreds.aws_credentials.session_token,
              });
            }
          }
        }
      }
      // If still expired after refresh, warn but continue (API calls may still work via JWT)
      const stillExpired =
        cliSigv4.accessKeyId === fileCreds.aws_credentials.access_key_id &&
        expMs < Date.now();
      if (stillExpired) {
        console.error(
          '[loxtep] AWS credentials expired and refresh did not return new ones. ' +
            'Stream bus writes will fail. Run `npx loxtep login` to get fresh credentials.'
        );
      }
    }
  }
  const authCtx = await createCliAuthContext({
    ...options,
    on_after_refresh: r => {
      options.on_after_refresh?.(r);
      if (r.aws_credentials) {
        Object.assign(cliSigv4, {
          accessKeyId: r.aws_credentials.access_key_id,
          secretAccessKey: r.aws_credentials.secret_access_key,
          sessionToken: r.aws_credentials.session_token,
        });
      }
    },
  });
  if (!authCtx) {
    return null;
  }
  const hasLegacyPrefix =
    config.api_path_prefix != null && String(config.api_path_prefix).length > 0;
  const client = new LoxtepClient({
    api_url: authCtx.api_url,
    ...(hasLegacyPrefix
      ? { api_path_prefix: config.api_path_prefix, url_resolution: 'legacy' as const }
      : { url_resolution: 'platform' as const }),
    auth: { type: 'jwt', token: '' },
    get_token: authCtx.get_token,
    refresh_auth: authCtx.refresh_auth,
    credentials: cliSigv4,
    region: config.region,
    organization_id: config.organization_id,
    project_id: config.project_id,
    instance_id: config.instance_id,
    ...(config.streams
      ? {
          streams: config.streams,
        }
      : {}),
  });
  return { client, config };
}

/** Exit with code 1 if auth or api_url missing. */
export async function requireCliClient(options: CreateCliClientOptions = {}): Promise<{
  client: LoxtepClient;
  config: Awaited<ReturnType<typeof loadConfig>>;
}> {
  const r = await createCliClient(options);
  if (!r) {
    console.error(
      'Missing api_url or access token. Run: npx loxtep login'
    );
    process.exit(1);
    return r as never;
  }
  return r;
}
