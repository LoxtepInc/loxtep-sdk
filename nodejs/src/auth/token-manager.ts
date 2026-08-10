import { decodeJwtPayload, DEFAULT_REFRESH_THRESHOLD_SECONDS } from './jwt.js';

export interface TokenState {
  access_token: string;
  refresh_token?: string;
  expires_at?: number; // Unix seconds
}

/**
 * In-memory token manager. No token persisted to disk.
 * setToken, getToken, shouldRefresh, getTokenOrRefresh (with optional refresh fetcher).
 */
export class TokenManager {
  private state: TokenState | null = null;

  setToken(access_token: string, refresh_token?: string, expires_at?: number): void {
    this.state = {
      access_token,
      refresh_token,
      expires_at,
    };
  }

  getToken(): string | null {
    return this.state?.access_token ?? null;
  }

  getRefreshToken(): string | null {
    return this.state?.refresh_token ?? null;
  }

  clear(): void {
    this.state = null;
  }

  /**
   * True if access token is missing or expires within thresholdSeconds.
   */
  shouldRefresh(thresholdSeconds: number = DEFAULT_REFRESH_THRESHOLD_SECONDS): boolean {
    const token = this.state?.access_token;
    if (!token) return true;
    const { exp } = decodeJwtPayload(token);
    if (exp == null) return false; // No exp claim → don't refresh
    const now = Math.floor(Date.now() / 1000);
    return exp - now < thresholdSeconds;
  }

  /** True when the access token's `exp` is already in the past. */
  isExpired(): boolean {
    const token = this.state?.access_token;
    if (!token) return true;
    const { exp } = decodeJwtPayload(token);
    if (exp == null) return false;
    return exp < Math.floor(Date.now() / 1000);
  }

  /**
   * Return access token, or refresh if shouldRefresh(thresholdSeconds) and refresh_token exists.
   * refreshFn(apiUrl, refresh_token) must return { access_token, refresh_token?, expires_in }.
   *
   * On refresh failure: return the current token only if it is still unexpired; otherwise
   * return `null` so callers fail closed instead of sending a known-dead JWT.
   */
  async getTokenOrRefresh(
    apiUrl: string,
    thresholdSeconds: number = DEFAULT_REFRESH_THRESHOLD_SECONDS,
    refreshFn: (
      apiUrl: string,
      refreshToken: string
    ) => Promise<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    }>
  ): Promise<string | null> {
    const token = this.getToken();
    if (!token) return null;
    if (!this.shouldRefresh(thresholdSeconds)) return token;
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return this.isExpired() ? null : token;
    }
    try {
      const result = await refreshFn(apiUrl.replace(/\/$/, ''), refreshToken);
      const expiresAt =
        result.expires_in != null ? Math.floor(Date.now() / 1000) + result.expires_in : undefined;
      this.setToken(result.access_token, result.refresh_token ?? refreshToken, expiresAt);
      return this.state?.access_token ?? null;
    } catch {
      return this.isExpired() ? null : token;
    }
  }
}
