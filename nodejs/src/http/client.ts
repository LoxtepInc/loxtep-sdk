import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentity } from '@smithy/types';
import { buildPlatformRequestUrl } from '../config/platform-request-url.js';
import { signRequest } from './signer.js';
import { parseHttpError } from '../errors/parse-http.js';

const DEFAULT_REGION = 'us-east-1';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

/** Rate limit info parsed from response headers (X-RateLimit-*). */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset_at: string;
  retry_after_seconds?: number;
}

export interface LoxtepHttpClientOptions {
  base_url: string;
  /**
   * When `true`, `base_url` must be the API origin only (e.g. `https://apidev.example.com`); each path is
   * resolved with {@link buildPlatformRequestUrl} (microservice as first public segment on shared hosts).
   * When `false` (default), the URL is `base_url + path` (legacy: single `api_path_prefix` baked into `base_url`).
   */
  use_platform_path_resolution?: boolean;
  get_token?: () => Promise<string | null>;
  region?: string;
  credentials?: AwsCredentialIdentity;
  fetch_fn?: typeof fetch;
  /** After 401, run once; return true to retry the same request with updated JWT from get_token. */
  refresh_auth?: () => Promise<boolean>;
}

function isRetryable(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 429;
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message?.includes('fetch')) return true;
  if (
    err instanceof Error &&
    (err.message === 'Failed to fetch' || err.message === 'Network request failed')
  )
    return true;
  return false;
}

/**
 * HTTP client that signs requests with AWS SigV4 and attaches JWT.
 * GET/POST/PUT/DELETE helpers; retry on 5xx/network; throws Loxtep errors on 4xx/5xx.
 */
export class LoxtepHttpClient {
  private readonly base_url: string;
  private readonly use_platform_path_resolution: boolean;
  private readonly get_token?: () => Promise<string | null>;
  private readonly region: string;
  private readonly credentialsProvider = fromNodeProviderChain();
  private credentials: AwsCredentialIdentity | null = null;
  private readonly fetch_fn: typeof fetch;
  private lastRateLimit: RateLimitInfo | null = null;
  private readonly refresh_auth?: () => Promise<boolean>;

  constructor(options: LoxtepHttpClientOptions) {
    this.base_url = options.base_url.replace(/\/$/, '');
    this.use_platform_path_resolution = options.use_platform_path_resolution === true;
    this.get_token = options.get_token;
    this.region = options.region ?? DEFAULT_REGION;
    this.fetch_fn = options.fetch_fn ?? fetch;
    this.refresh_auth = options.refresh_auth;
    if (options.credentials) {
      this.credentials = options.credentials;
    }
  }

  /** Replace static SigV4 credentials (e.g. after /auth/refresh returns STS). */
  setAwsCredentials(credentials: AwsCredentialIdentity | null): void {
    this.credentials = credentials;
  }

  private async getCredentials(): Promise<AwsCredentialIdentity> {
    if (this.credentials) return this.credentials;
    const creds = await this.credentialsProvider();
    if (!creds?.accessKeyId || !creds?.secretAccessKey) {
      throw new Error(
        'AWS credentials not available. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or use an IAM role.'
      );
    }
    this.credentials = creds;
    return creds;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    retryCount = 0,
    authRetry = 0
  ): Promise<T> {
    const pathPart = path.startsWith('http')
      ? path
      : this.use_platform_path_resolution
        ? buildPlatformRequestUrl(this.base_url, path)
        : `${this.base_url}${path.startsWith('/') ? path : `/${path}`}`;
    const url = new URL(pathPart);
    const bodyString = body !== undefined ? JSON.stringify(body) : undefined;

    const headers: Record<string, string> = {};
    if (this.get_token) {
      const token = await this.get_token();
      if (token) headers['x-jwt-token'] = token;
    }

    const credentials = await this.getCredentials();
    const signedHeaders = await signRequest({
      method,
      url,
      headers,
      body: bodyString,
      credentials,
      region: this.region,
    });

    let response: Response;
    try {
      response = await this.fetch_fn(url.toString(), {
        method,
        headers: signedHeaders,
        body: bodyString,
      });
    } catch (err) {
      if (isNetworkError(err) && retryCount < MAX_RETRIES) {
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, delay));
        return this.request<T>(method, path, body, retryCount + 1, authRetry);
      }
      throw err;
    }

    const requestId = response.headers.get('x-request-id') ?? undefined;
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { message: response.statusText };
    }

    if (response.status === 401 && authRetry === 0 && this.refresh_auth) {
      const ok = await this.refresh_auth();
      if (ok) {
        return this.request<T>(method, path, body, retryCount, authRetry + 1);
      }
    }

    if (response.status >= 400) {
      if (isRetryable(response.status) && retryCount < MAX_RETRIES) {
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, delay));
        return this.request<T>(method, path, body, retryCount + 1, authRetry);
      }
      throw parseHttpError(response.status, parsed, requestId);
    }

    this.captureRateLimitFromResponse(response);
    return parsed as T;
  }

  private captureRateLimitFromResponse(response: Response): void {
    const limitHeader = response.headers.get('x-ratelimit-limit');
    const remainingHeader = response.headers.get('x-ratelimit-remaining');
    const resetHeader = response.headers.get('x-ratelimit-reset');
    const retryAfter = response.headers.get('retry-after');
    if (limitHeader != null || remainingHeader != null || resetHeader != null) {
      const limit = limitHeader != null ? parseInt(limitHeader, 10) : 0;
      const remaining = remainingHeader != null ? parseInt(remainingHeader, 10) : 0;
      const reset_at =
        resetHeader != null
          ? resetHeader
          : retryAfter != null
            ? new Date(Date.now() + parseInt(retryAfter, 10) * 1000).toISOString()
            : new Date().toISOString();
      const retry_after_seconds = retryAfter != null ? parseInt(retryAfter, 10) : undefined;
      this.lastRateLimit = {
        limit: Number.isNaN(limit) ? 0 : limit,
        remaining: Number.isNaN(remaining) ? 0 : remaining,
        reset_at,
        retry_after_seconds:
          retry_after_seconds != null && !Number.isNaN(retry_after_seconds)
            ? retry_after_seconds
            : undefined,
      };
    }
  }

  /** Last rate limit info from response headers (if any). */
  getLastRateLimit(): RateLimitInfo | null {
    return this.lastRateLimit;
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
