/**
 * Loxtep’s shared API host routes each **microservice** as the first path segment (e.g. `…/dataproducts/...`,
 * `…/workflows/…`, `…/app/…` for `observe`). The SDK’s relative paths (e.g. `/dataproducts`, `/workflows/projects`)
 * are the **API Gateway resource tree** for that service, so the public URL is usually:
 *   `{host}/{microservice}{samePath}`
 * and when `path` already begins with a microservice (e.g. `/ai/…`, `/graph/…`) we do **not** add another
 * segment (see `PATH_ALREADY_HAS_SERVICE_PREFIX`).
 *
 * For backend route definitions, see each microservice’s `config.loxtep.api.uri` in
 * `platform-backend` per-service `api` trees (`.../api/.../package.json`).
 */

/** Paths that are already correct from the host root (include the gateway’s first segment in `path`). */
const PATH_ALREADY_HAS_SERVICE_PREFIX = /^\/(ai|graph)(\/|$)/;

const MICROSERVICE_OVERRIDES: Readonly<Record<string, string>> = {
  /** Observe, botmon-style routes live in the `app` microservice. */
  observe: 'app',
  /** Global rate limit discovery (if deployed on app stack). */
  'rate-limits': 'app',
};

function getSearchMicroserviceFromEnv(): string {
  return process.env.LOXTEP_PLATFORM_SEARCH_MS?.trim() || 'graph';
}

/**
 * Returns the public URL path (first segment) for the service that handles this request path, before overrides.
 * Typically the first segment of `path` is the **resource** name in CDK, which is often the same as the
 * microservice id (`dataproducts`, `workflows`, `organizations`, …).
 */
/** Split path and optional query string (`?…`); query includes the leading `?` when present. */
function splitPathAndQuery(path: string): { pathname: string; search: string } {
  const q = path.indexOf('?');
  if (q < 0) {
    return { pathname: path, search: '' };
  }
  return { pathname: path.slice(0, q), search: path.slice(q) };
}

export function getGatewayMicroserviceId(path: string): string {
  const { pathname } = splitPathAndQuery(path);
  const first = pathname.replace(/^\//, '').split('/').filter(Boolean)[0] ?? '';
  if (first === 'search') {
    return getSearchMicroserviceFromEnv();
  }
  return MICROSERVICE_OVERRIDES[first] ?? first;
}

/**
 * Build a full request URL for a shared control-plane host.
 * - `/ai/…`, `/graph/…`: `path` is already a full public path from the host root.
 * - `/dataproducts/…`: SDK paths are in-service; public routes are `…/dataproducts/dataproducts/…`.
 * - Most other services: in-service path starts with a microservice segment (e.g. `/workflows/projects`);
 *   public is `…/workflows/projects` (do **not** prepend the microservice again).
 * - One-segment paths (e.g. `/workflows`, `/search`, `/governance`) still need a prefix: `…/workflows/workflow`, `…/graph/search`, `…/governance/governance`.
 * - Query strings on `path` (e.g. `?page_size=1`) are preserved on the returned URL.
 */
export function buildPlatformRequestUrl(apiHost: string, path: string): string {
  const host = apiHost.replace(/\/$/, '');
  const { pathname, search } = splitPathAndQuery(path);
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (PATH_ALREADY_HAS_SERVICE_PREFIX.test(p)) {
    return `${host}${p}${search}`;
  }
  if (!p || p === '/') {
    return `${host}${search}`;
  }
  const segments = p.replace(/^\//, '').split('/').filter(Boolean);
  if (segments.length === 0) {
    return `${host}${search}`;
  }
  const first = segments[0] ?? '';
  const microservice = getGatewayMicroserviceId(p);

  if (first === 'dataproducts') {
    return `${host}/dataproducts/dataproducts${p.slice('/dataproducts'.length)}${search}`;
  }

  if (segments.length === 1) {
    if (!microservice) return `${host}${p}${search}`;
    return `${host}/${microservice}${p}${search}`;
  }

  if (first === microservice) {
    return `${host}${p}${search}`;
  }
  if (microservice) {
    return `${host}/${microservice}${p}${search}`;
  }
  return `${host}${p}${search}`;
}

/**
 * All path prefixes the Node SDK’s `LoxtepClient` can emit (for docs / `loxtep config paths` extensions).
 * Values are the **path** part after `base_url` in the SDK source (before `buildPlatformRequestUrl`).
 */
export const SDK_HTTP_PATHS_BY_FEATURE: {
  feature: string;
  pathPrefixes: string[];
}[] = [
  {
    feature: 'auth (login/refresh) — not via LoxtepClient',
    pathPrefixes: ['/auth/login', '/auth/refresh'],
  },
  {
    feature: 'data_products, schemas (partial), quality, consumptions, templates',
    pathPrefixes: ['/dataproducts', '/search'],
  },
  { feature: 'catalog', pathPrefixes: ['/search'] },
  { feature: 'flows, workflows, projects, connections', pathPrefixes: ['/workflows'] },
  { feature: 'domains, instances (organizations API)', pathPrefixes: ['/organizations'] },
  { feature: 'standards (governance)', pathPrefixes: ['/governance'] },
  { feature: 'connectors', pathPrefixes: ['/connectors'] },
  { feature: 'observe, queues, data_products trace (HTTP fallback)', pathPrefixes: ['/observe'] },
  { feature: 'discovery (MCP tools)', pathPrefixes: ['/ai/mcp/'] },
  { feature: 'thesaurus', pathPrefixes: ['/graph/organizations/'] },
  { feature: 'process_intelligence, procedures', pathPrefixes: ['/process-intelligence'] },
  { feature: 'rate limits', pathPrefixes: ['/rate-limits'] },
];
