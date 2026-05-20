/**
 * Loxtep public HTTP APIs: the first path segment is the microservice (e.g. `app`, `dataproducts`)
 * on the shared API host. The SDK and CLI must not assume `/auth/login` is at the origin root.
 */

/** Last non-empty path segment of an absolute http(s) URL. */
function lastUrlPathSegment(absoluteBaseUrl: string): string | null {
  try {
    const p = new URL(absoluteBaseUrl).pathname.replace(/\/$/, '');
    const segs = p.split('/').filter(Boolean);
    return segs.length ? (segs[segs.length - 1] as string) : null;
  } catch {
    return null;
  }
}

const DEFAULT_AUTH_PATH_PREFIX = 'app';

/**
 * Build URL for `POST` auth endpoints (`/auth/login`, `/auth/refresh`).
 * When `pathPrefix` is `undefined` (key absent from config), the default segment is `app` (app microservice).
 * When `pathPrefix` is `''`, no extra segment is added.
 */
export function buildAuthServiceUrl(
  baseUrl: string,
  pathPrefix: string | undefined,
  resourcePath: string
): string {
  const base = baseUrl.replace(/\/$/, '');
  const seg =
    pathPrefix === undefined
      ? DEFAULT_AUTH_PATH_PREFIX
      : String(pathPrefix).replace(/^\/+|\/+$/g, '');
  const rp = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  if (seg.length === 0) {
    return `${base}${rp}`;
  }
  const last = lastUrlPathSegment(base);
  if (last === seg) {
    return `${base}${rp}`;
  }
  return `${base}/${seg}${rp}`;
}

/**
 * For {@link LoxtepClient}: extends `api_url` with one path segment when set (e.g. `dataproducts`),
 * and avoids duplicating a trailing segment that already matches.
 * When `pathPrefix` is `undefined` or `''`, returns `api_url` (trimmed).
 */
export function extendClientBaseUrl(apiUrl: string, pathPrefix: string | undefined | null): string {
  if (pathPrefix === undefined || pathPrefix === null) {
    return apiUrl.replace(/\/$/, '');
  }
  const seg = String(pathPrefix).replace(/^\/+|\/+$/g, '');
  if (seg.length === 0) {
    return apiUrl.replace(/\/$/, '');
  }
  const base = apiUrl.replace(/\/$/, '');
  const last = lastUrlPathSegment(base);
  if (last === seg) {
    return base;
  }
  return `${base}/${seg}`;
}
