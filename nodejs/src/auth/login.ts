import { buildAuthServiceUrl } from '../config/api-path.js';

/**
 * Login and refresh using platform auth endpoints.
 * POST .../{app}/auth/login and POST .../{app}/auth/refresh (first segment = app microservice by default). No token on disk.
 */

/** Thrown when POST /auth/login returns 403 and the user must supply TOTP (same as the web app for MFA). */
export class LoginMfaRequiredError extends Error {
  override readonly name = 'LoginMfaRequiredError';
  constructor() {
    super('MFA code required');
  }
}

/** Same snake_case shape as platform login/refresh JSON. */
export type AwsCredentialsSnake = {
  access_key_id: string;
  secret_access_key: string;
  session_token: string;
  expiration: string;
};

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  expires_at: string;
  aws_credentials?: AwsCredentialsSnake;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: string;
  aws_credentials?: AwsCredentialsSnake;
}

const DEFAULT_FETCH = typeof fetch !== 'undefined' ? fetch : undefined;

/** Undici/Node `fetch` throws `TypeError: fetch failed` with no URL; rethrow with `POST {url}` and `error.cause`. */
function rethrowNetworkError(method: string, url: string, err: unknown): never {
  const e = err instanceof Error ? err : new Error(String(err));
  const cause = (e as { cause?: unknown }).cause;
  const causeMsg =
    cause instanceof Error
      ? cause.message
      : cause !== undefined && cause !== null
        ? String(cause)
        : '';
  const tail = [e.message, causeMsg].filter(s => s.length > 0).join(' — ');
  throw new Error(`${method} ${url} failed${tail ? `: ${tail}` : ''}`);
}

async function doFetch(
  method: string,
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch
): Promise<Response> {
  try {
    return await fetchFn(url, init);
  } catch (e) {
    rethrowNetworkError(method, url, e);
  }
}

/** Standard API error: WebError `context` is serialized as `error.details` (not `error.context`). */
type LoginErrorBody = {
  mfaRequired?: boolean;
  error?: string | LoginErrorObject;
};

type LoginErrorObject = {
  message?: string;
  details?: { mfaRequired?: boolean; [k: string]: unknown };
  context?: { mfaRequired?: boolean };
};

function isMfaRequiredResponse(status: number, json: LoginErrorBody): boolean {
  if (status !== 403) return false;
  if (json.mfaRequired === true) return true;
  const e = json.error;
  if (e && typeof e === 'object') {
    if (e.details?.mfaRequired === true) return true;
    if (e.context?.mfaRequired === true) return true;
    if (typeof e.message === 'string' && /\bmfa\b/i.test(e.message)) return true;
  }
  if (typeof e === 'string' && /\bmfa\b/i.test(e)) return true;
  return false;
}

function getLoginErrorMessage(json: LoginErrorBody, res: { statusText: string }): string {
  const e = json.error;
  if (typeof e === 'string' && e.trim()) return e;
  if (e && typeof e === 'object' && typeof e.message === 'string' && e.message.trim()) {
    return e.message;
  }
  return res.statusText;
}

/**
 * Login with email/password. POST `{apiUrl}/{auth_path}/auth/login` (default `auth_path` = `app`).
 * Returns tokens; caller should set them in TokenManager (no disk).
 */
export async function login(
  apiUrl: string,
  email: string,
  password: string,
  options?: {
    organization_id?: string;
    mfa_code?: string;
    /** Omitted: default `app`. Set to `""` to omit (if `api_url` already includes `/app`). */
    auth_path_prefix?: string;
    fetchFn?: typeof fetch;
  }
): Promise<LoginResponse> {
  const base = apiUrl.replace(/\/$/, '');
  const url = buildAuthServiceUrl(base, options?.auth_path_prefix, '/auth/login');
  const body = {
    email,
    password,
    ...(options?.organization_id && { organization_id: options.organization_id }),
    ...(options?.mfa_code && { mfa_code: options.mfa_code }),
  };
  const fetchFn = options?.fetchFn ?? DEFAULT_FETCH;
  if (!fetchFn) throw new Error('fetch not available');
  const res = await doFetch(
    'POST',
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    fetchFn
  );
  const json = (await res.json()) as {
    success?: boolean;
    mfaRequired?: boolean;
    data?: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      expires_at?: string;
      aws_credentials?: AwsCredentialsSnake;
    };
  } & LoginErrorBody;
  if (!res.ok) {
    if (isMfaRequiredResponse(res.status, json)) {
      throw new LoginMfaRequiredError();
    }
    const msg = getLoginErrorMessage(json, res);
    throw new Error(String(msg));
  }
  const payload = json?.data;
  if (!payload?.access_token) throw new Error('Invalid login response');
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in ?? 3600,
    expires_at: payload.expires_at ?? '',
    ...(payload.aws_credentials ? { aws_credentials: payload.aws_credentials } : {}),
  };
}

/**
 * Refresh access token. POST `{apiUrl}/{auth_path}/auth/refresh` (default path segment: `app`).
 */
export async function refresh(
  apiUrl: string,
  refreshToken: string,
  options?: { auth_path_prefix?: string; fetchFn?: typeof fetch }
): Promise<RefreshResponse> {
  const base = apiUrl.replace(/\/$/, '');
  const url = buildAuthServiceUrl(base, options?.auth_path_prefix, '/auth/refresh');
  const fetchFn = options?.fetchFn ?? DEFAULT_FETCH;
  if (!fetchFn) throw new Error('fetch not available');
  const res = await doFetch(
    'POST',
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    fetchFn
  );
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      expires_at?: string;
      aws_credentials?: AwsCredentialsSnake;
    };
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: string;
    aws_credentials?: AwsCredentialsSnake;
    error?: string;
  };
  if (!res.ok) {
    const rawErr = json?.error;
    const msg =
      typeof rawErr === 'string'
        ? rawErr
        : rawErr && typeof rawErr === 'object' && 'message' in rawErr
          ? String((rawErr as { message?: unknown }).message)
          : res.statusText;
    throw new Error(msg);
  }
  const payload = json.success && json.data && typeof json.data === 'object' ? json.data : json;
  if (!payload?.access_token) throw new Error('Invalid refresh response');
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? refreshToken,
    expires_in: payload.expires_in ?? 3600,
    expires_at: payload.expires_at ?? '',
    ...(payload.aws_credentials ? { aws_credentials: payload.aws_credentials } : {}),
  };
}
