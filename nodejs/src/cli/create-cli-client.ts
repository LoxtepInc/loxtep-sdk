/**
 * Build LoxtepClient for CLI commands: merged auth, JWT, and STS SigV4 from login.
 */

import { loadConfig } from '../config/load.js';
import { loadCliConfig } from './load-cli-config.js';
import { resolveCliAccessToken, type CliAuthSource } from './auth-resolve.js';
import { writeCredentials, readCredentials, resolveCredentialsPath } from './credentials.js';
import { TokenManager } from '../auth/token-manager.js';
import { refresh, type RefreshResponse, type AwsCredentialsSnake } from '../auth/login.js';
import { decodeJwtPayload } from '../auth/jwt.js';
import { LoxtepClient } from '../client/loxtep-client.js';
import { LoxtepHttpClient } from '../http/client.js';
import { resolveCliApiUrl } from './resolve-api-url.js';
import { waitForUpdateCheck } from './update-notifier.js';
import { AuthenticationError, sessionExpiredError } from '../errors/auth.js';
import { resolveDeployTokenInputs } from './deploy-token-resolve.js';
import { exchangeDeployToken } from '../auth/deploy-token.js';

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
  /** CI deploy-token target project (from a `--project` flag); wins over LOXTEP_PROJECT_ID. */
  deploy_project_id?: string;
  /** CI deploy-token audit actor (from an `--actor` flag); wins over LOXTEP_ACTOR. */
  deploy_actor?: string;
}

function jwtExpSeconds(token: string): number | undefined {
  const { exp } = decodeJwtPayload(token);
  return exp;
}

function awsCredentialsExpired(aws: { expiration?: string } | undefined): boolean {
  if (!aws?.expiration) return false;
  return new Date(aws.expiration).getTime() < Date.now();
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

function applyAwsCredentials(target: CliSigV4Credentials, aws: AwsCredentialsSnake): void {
  Object.assign(target, {
    accessKeyId: aws.access_key_id,
    secretAccessKey: aws.secret_access_key,
    sessionToken: aws.session_token,
  });
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

  const expired = awsCredentialsExpired(fileCreds?.aws_credentials);
  const hadAws = Boolean(fileCreds?.aws_credentials);

  if (!hadAws || expired) {
    const authCtxForRefresh = await createCliAuthContext({
      ...options,
      on_after_refresh: r => {
        options.on_after_refresh?.(r);
        if (r.aws_credentials) {
          applyAwsCredentials(cliSigv4, r.aws_credentials);
        }
      },
    });
    if (authCtxForRefresh) {
      await authCtxForRefresh.refresh_auth();
      fileCreds = await readCredentials(credsPath);
      const nextAws = fileCreds?.aws_credentials;
      if (nextAws && !awsCredentialsExpired(nextAws)) {
        applyAwsCredentials(cliSigv4, nextAws);
      } else if (expired) {
        // Had STS that expired — do not keep signing with a corpse token.
        // API Gateway returns a cryptic 403 that looks like an RBAC failure.
        throw sessionExpiredError(
          'AWS session credentials expired and could not be refreshed'
        );
      }
      // Missing STS entirely: keep dummy fallback below (tests / JWT-only setups).
    } else if (expired) {
      throw sessionExpiredError('Missing access token');
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
        applyAwsCredentials(sigv4, r.aws_credentials);
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
 * Build a CLI auth context from a CI deploy token when LOXTEP_DEPLOY_TOKEN is set.
 *
 * The deploy token is exchanged for a 15-minute project-scoped access token; the
 * minted token is cached in memory and re-exchanged (not user-refreshed) when it
 * nears expiry. There is no credentials.json and no AWS SigV4 — CI has neither.
 *
 * Returns null when no deploy token is present (caller falls through to the
 * interactive credentials path).
 */
async function createDeployTokenAuthContext(
  options: CreateCliClientOptions,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<CliAuthContext | null> {
  const inputs = resolveDeployTokenInputs({
    projectId: options.deploy_project_id,
    actor: options.deploy_actor,
    configProjectId: config.project_id,
  });
  if (!inputs) return null;

  const api_url = resolveCliApiUrl(config, null, { configFilePath: options.configFilePath });
  if (!api_url) return null;

  const tm = new TokenManager();

  const exchange = async (): Promise<string> => {
    const r = await exchangeDeployToken(api_url, inputs.deploy_token, inputs.project_id, {
      actor: inputs.actor,
      fetchFn: options.fetch_fn,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + r.expires_in;
    tm.setToken(r.access_token, undefined, expiresAt);
    // Feed STS into the SigV4 signer via the same seam login/refresh use. The
    // data plane is IAM-gated, so without these creds every call 403s.
    if (r.aws_credentials) {
      options.on_after_refresh?.({
        access_token: r.access_token,
        refresh_token: '',
        expires_in: r.expires_in,
        expires_at: new Date(expiresAt * 1000).toISOString(),
        aws_credentials: r.aws_credentials,
      });
    }
    return r.access_token;
  };

  const get_token = async (): Promise<string | null> => {
    // Exchange on first use, and re-exchange within 60s of expiry.
    if (!tm.getToken() || tm.shouldRefresh(60)) {
      return exchange();
    }
    return tm.getToken();
  };

  // A 401 from the data plane means the minted token lapsed or was revoked — try
  // one fresh exchange; a revoked deploy token surfaces as a failed exchange.
  const refresh_auth = async (): Promise<boolean> => {
    try {
      await exchange();
      return true;
    } catch {
      return false;
    }
  };

  return { api_url, get_token, refresh_auth };
}

/**
 * Shared CLI auth: proactive refresh near JWT expiry + {@link LoxtepHttpClient} 401 retry via refresh_auth.
 */
export async function createCliAuthContext(
  options: CreateCliClientOptions = {}
): Promise<CliAuthContext | null> {
  const config = await loadConfig(options.configFilePath);

  // CI deploy-token path (headless, no browser/MFA/SigV4). Takes precedence over
  // interactive credentials when LOXTEP_DEPLOY_TOKEN is set.
  const deployCtx = await createDeployTokenAuthContext(options, config);
  if (deployCtx) return deployCtx;

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
    if (!refreshed) {
      throw sessionExpiredError('Session expired or could not be refreshed');
    }
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
  config: Awaited<ReturnType<typeof loadCliConfig>>['config'];
} | null> {
  const { config } = await loadCliConfig({
    configFilePath: options.configFilePath,
    cwd: options.cwd,
  });
  const cliSigv4 = await resolveCliSigV4Credentials(options);
  const authCtx = await createCliAuthContext({
    ...options,
    on_after_refresh: r => {
      options.on_after_refresh?.(r);
      if (r.aws_credentials) {
        applyAwsCredentials(cliSigv4, r.aws_credentials);
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
    client_surface: 'cli',
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
  config: Awaited<ReturnType<typeof loadCliConfig>>['config'];
}> {
  try {
    const r = await createCliClient(options);
    if (!r) {
      console.error('Missing api_url or access token. Run: loxtep login');
      // Let the in-flight update check (if any) print its notice before the hard exit below —
      // process.exit() skips pending promises and finally blocks up the call stack, so without
      // this the notice would never print for any command run without valid credentials.
      await waitForUpdateCheck();
      process.exit(1);
      return r as never;
    }
    return r;
  } catch (err) {
    if (err instanceof AuthenticationError) {
      console.error(err.message);
      await waitForUpdateCheck();
      process.exit(1);
      return undefined as never;
    }
    throw err;
  }
}
