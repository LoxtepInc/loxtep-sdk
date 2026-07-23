/**
 * Build LoxtepClient for CLI commands: merged auth, JWT, and STS SigV4 from login.
 */

import { loadConfig } from '../config/load.js';
import { resolveCliAccessToken, type CliAuthSource } from './auth-resolve.js';
import { writeCredentials, readCredentials, resolveCredentialsPath } from './credentials.js';
import { TokenManager } from '../auth/token-manager.js';
import { refresh, type RefreshResponse, type AwsCredentialsSnake } from '../auth/login.js';
import { decodeJwtPayload } from '../auth/jwt.js';
import { LoxtepClient } from '../client/loxtep-client.js';
import { LoxtepHttpClient } from '../http/client.js';
import { resolveCliApiUrl } from './resolve-api-url.js';

export interface CreateCliClientOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  /** Working directory used to resolve project-local credentials (default: `process.cwd()`). */
  cwd?: string;
  /** Mock or custom fetch for CLI integration tests. */
  fetch_fn?: typeof fetch;
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
  credentialsPath: string
): Promise<void> {
  if (source !== 'credentials') return;
  const prev = await readCredentials(credentialsPath);
  await writeCredentials(
    {
      access_token,
      refresh_token,
      expires_at,
      aws_credentials: aws_credentials ?? prev?.aws_credentials,
    },
    credentialsPath
  );
}

export interface CliAuthContext {
  api_url: string;
  get_token: () => Promise<string | null>;
  refresh_auth: () => Promise<boolean>;
}

export type CliSigV4Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

const DUMMY_SIGV4: CliSigV4Credentials = { accessKeyId: 'cli', secretAccessKey: 'cli' };

function isDummySigV4(creds: CliSigV4Credentials): boolean {
  return creds.accessKeyId === 'cli' && creds.secretAccessKey === 'cli';
}

/** Load STS credentials from credentials.json (with expiry refresh), or dummy dev fallback. */
export async function resolveCliSigV4Credentials(
  options: CreateCliClientOptions = {}
): Promise<CliSigV4Credentials> {
  const credsPath = options.credentialsPath ?? resolveCredentialsPath(options.cwd).path;
  let fileCreds = await readCredentials(credsPath);
  const cliSigv4: CliSigV4Credentials = fileCreds?.aws_credentials
    ? {
        accessKeyId: fileCreds.aws_credentials.access_key_id,
        secretAccessKey: fileCreds.aws_credentials.secret_access_key,
        sessionToken: fileCreds.aws_credentials.session_token,
      }
    : { ...DUMMY_SIGV4 };

  const expired =
    fileCreds?.aws_credentials?.expiration &&
    new Date(fileCreds.aws_credentials.expiration).getTime() < Date.now();

  if (!fileCreds?.aws_credentials || expired) {
    const authCtxForRefresh = await createCliAuthContext({
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
    if (authCtxForRefresh) {
      await authCtxForRefresh.refresh_auth();
      fileCreds = await readCredentials(credsPath);
      if (fileCreds?.aws_credentials) {
        Object.assign(cliSigv4, {
          accessKeyId: fileCreds.aws_credentials.access_key_id,
          secretAccessKey: fileCreds.aws_credentials.secret_access_key,
          sessionToken: fileCreds.aws_credentials.session_token,
        });
      }
    }
  }

  if (isDummySigV4(cliSigv4)) {
    console.error(
      '[loxtep] No AWS SigV4 credentials in credentials.json — API calls may return empty responses. ' +
        'Run `loxtep login` again (browser login should mint STS creds via refresh).'
    );
  }

  return cliSigv4;
}

/** HTTP client for CLI commands: platform URL resolution, JWT, and STS SigV4 from login. */
export async function createCliHttpClient(
  options: CreateCliClientOptions = {}
): Promise<{ http: LoxtepHttpClient; auth: CliAuthContext } | null> {
  const config = await loadConfig(options.configFilePath);
  const sigv4 = await resolveCliSigV4Credentials(options);
  const authCtx = await createCliAuthContext({
    ...options,
    on_after_refresh: r => {
      options.on_after_refresh?.(r);
      if (r.aws_credentials) {
        sigv4.accessKeyId = r.aws_credentials.access_key_id;
        sigv4.secretAccessKey = r.aws_credentials.secret_access_key;
        sigv4.sessionToken = r.aws_credentials.session_token;
      }
    },
  });
  if (!authCtx) return null;

  const http = new LoxtepHttpClient({
    base_url: authCtx.api_url,
    use_platform_path_resolution: true,
    get_token: authCtx.get_token,
    refresh_auth: authCtx.refresh_auth,
    credentials: sigv4,
    region: config.region,
    ...(options.fetch_fn ? { fetch_fn: options.fetch_fn } : {}),
  });

  return { http, auth: authCtx };
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
    cwd: options.cwd,
  });
  const api_url = resolveCliApiUrl(config, resolved, {
    configFilePath: options.configFilePath,
  });
  if (!api_url || !resolved?.access_token) {
    return null;
  }

  const tm = new TokenManager();
  const exp = jwtExpSeconds(resolved.access_token);
  tm.setToken(resolved.access_token, resolved.refresh_token, exp);

  const source = resolved.source;
  // The exact file the token was read from — refreshed tokens must be written
  // back to this same file (local project creds vs. global ~/.loxtep), not
  // wherever the global default happens to point.
  const credentialsPath =
    options.credentialsPath ?? resolved.credentials_path ?? resolveCredentialsPath(options.cwd).path;
  const refreshFn = async (apiUrl: string, refreshToken: string) => {
    const r = await refresh(apiUrl, refreshToken, {
      auth_path_prefix: config.auth_path_prefix,
      fetchFn: options.fetch_fn,
    });
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
      credentialsPath
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
  const cliSigv4 = await resolveCliSigV4Credentials(options);
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
    ...(options.fetch_fn ? { fetch_fn: options.fetch_fn } : {}),
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
      'Missing api_url or access token. Run: pnpm exec loxtep login'
    );
    process.exit(1);
    return r as never;
  }
  return r;
}
