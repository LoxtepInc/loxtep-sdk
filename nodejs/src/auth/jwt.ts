/**
 * Decode JWT payload without verification.
 * Used client-side only for refresh threshold and display fallbacks — not for authorization.
 */
export function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return {};
    const payload = parts[1];
    if (!payload) return {};
    const decoded = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf-8'
    );
    const parsed = JSON.parse(decoded) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** @deprecated Prefer {@link decodeJwtClaims} when more than `exp` is needed. */
export function decodeJwtPayload(token: string): { exp?: number } {
  const claims = decodeJwtClaims(token);
  const exp = typeof claims.exp === 'number' ? claims.exp : undefined;
  return { exp };
}

/** Default refresh threshold: refresh when less than 5 minutes until expiry. */
export const DEFAULT_REFRESH_THRESHOLD_SECONDS = 300;
