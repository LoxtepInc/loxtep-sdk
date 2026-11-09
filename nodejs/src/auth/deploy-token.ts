import { buildAuthServiceUrl } from '../config/api-path.js';

/**
 * CI deploy-token exchange.
 *
 * A long-lived, org-scoped deploy token (`lxdt_...`) is traded for a short-lived
 * (15-minute) project-scoped platform JWT. This is the headless-CI auth path:
 * no browser, no MFA, no AWS SigV4 — the deploy token is the only credential.
 *
 * Endpoint: POST {apiUrl}/organizations/auth/deploy-token
 *   Authorization: Bearer lxdt_...
 *   body: { project_id }
 *   optional header: x-loxtep-actor (commit SHA / PR author / bot name, audit only)
 *   -> { access_token, expires_in }
 */

const DEFAULT_FETCH = typeof fetch !== 'undefined' ? fetch : undefined;

/** Microservice segment that owns the exchange endpoint. */
const DEPLOY_TOKEN_AUTH_PREFIX = 'organizations';

/** snake_case STS shape, identical to login/refresh `aws_credentials`. */
export interface DeployTokenAwsCredentials {
  access_key_id: string;
  secret_access_key: string;
  session_token: string;
  expiration: string;
}

export interface DeployTokenExchangeResponse {
  access_token: string;
  expires_in: number;
  /** Short-lived STS creds for SigV4-signing the IAM-gated data plane. */
  aws_credentials?: DeployTokenAwsCredentials;
}

function rethrowNetworkError(url: string, err: unknown): never {
  const e = err instanceof Error ? err : new Error(String(err));
  const cause = (e as { cause?: unknown }).cause;
  const causeMsg =
    cause instanceof Error ? cause.message : cause != null ? String(cause) : '';
  const tail = [e.message, causeMsg].filter(s => s.length > 0).join(' — ');
  throw new Error(`POST ${url} failed${tail ? `: ${tail}` : ''}`);
}

/**
 * Exchange a deploy token for a project-scoped access token.
 *
 * @param apiUrl       API gateway base (e.g. https://apidev.loxtep.io).
 * @param deployToken  The raw `lxdt_...` secret.
 * @param projectId    The project the minted token is scoped to.
 * @param options.actor  Optional audit actor, sent as `x-loxtep-actor`.
 */
export async function exchangeDeployToken(
  apiUrl: string,
  deployToken: string,
  projectId: string,
  options?: { actor?: string; fetchFn?: typeof fetch }
): Promise<DeployTokenExchangeResponse> {
  const base = apiUrl.replace(/\/$/, '');
  const url = buildAuthServiceUrl(base, DEPLOY_TOKEN_AUTH_PREFIX, '/auth/deploy-token');
  const fetchFn = options?.fetchFn ?? DEFAULT_FETCH;
  if (!fetchFn) throw new Error('fetch not available');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${deployToken}`,
  };
  if (options?.actor) headers['x-loxtep-actor'] = options.actor;

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ project_id: projectId }),
    });
  } catch (e) {
    rethrowNetworkError(url, e);
  }

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: {
      access_token?: string;
      expires_in?: number;
      aws_credentials?: DeployTokenAwsCredentials;
    };
    access_token?: string;
    expires_in?: number;
    aws_credentials?: DeployTokenAwsCredentials;
    error?: unknown;
  };

  if (!res.ok) {
    const rawErr = json?.error;
    const msg =
      typeof rawErr === 'string'
        ? rawErr
        : rawErr && typeof rawErr === 'object' && 'message' in rawErr
          ? String((rawErr as { message?: unknown }).message)
          : res.statusText || `deploy-token exchange failed (${res.status})`;
    throw new Error(msg);
  }

  // Accept both flat and { success, data } shapes, like login()/refresh().
  const payload = json.success && json.data && typeof json.data === 'object' ? json.data : json;
  if (!payload?.access_token) {
    throw new Error('Invalid deploy-token exchange response');
  }
  return {
    access_token: payload.access_token,
    expires_in: payload.expires_in ?? 900,
    ...(payload.aws_credentials ? { aws_credentials: payload.aws_credentials } : {}),
  };
}
