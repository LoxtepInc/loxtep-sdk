/**
 * Decode JWT payload to read exp (expiry) without verification.
 * Used client-side only for refresh threshold; do not use for security decisions.
 */
export function decodeJwtPayload(token: string): { exp?: number } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return {};
    const payload = parts[1];
    if (!payload) return {};
    const decoded = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf-8'
    );
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const exp = typeof parsed.exp === 'number' ? parsed.exp : undefined;
    return { exp };
  } catch {
    return {};
  }
}

/** Default refresh threshold: refresh when less than 5 minutes until expiry. */
export const DEFAULT_REFRESH_THRESHOLD_SECONDS = 300;
