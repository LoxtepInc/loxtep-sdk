import { buildAuthServiceUrl, extendClientBaseUrl } from './api-path.js';
import { buildPlatformRequestUrl } from './platform-request-url.js';
import type { LoxtepConfig } from './types.js';

/** Placeholder UUIDs for `loxtep config paths` (not real resource IDs). */
const PH_ID = '00000000-0000-0000-0000-000000000001';
const PH_Q = 'queue-name';

/**
 * One example path per LoxtepClient surface (see `src/client/*.ts`). Used only for `resolveSdkApiPaths` / CLI output.
 */
export const SDK_EXAMPLE_PATHS: ReadonlyArray<{ label: string; path: string }> = [
  { label: 'data_products: list, create', path: '/dataproducts' },
  { label: 'data_products: get, schema', path: `/dataproducts/${PH_ID}` },
  { label: 'data_products: post query', path: '/dataproducts/query' },
  { label: 'data_products: list tables', path: `/dataproducts/${PH_ID}/tables` },
  { label: 'data_products: catalog / internal search', path: '/search' },
  { label: 'templates: list, get', path: '/dataproducts/templates' },
  { label: 'quality: list, get', path: '/dataproducts/quality-metrics' },
  { label: 'data_contracts: list, get', path: '/dataproducts/datacontracts' },
  { label: 'consumptions: per data product', path: `/dataproducts/${PH_ID}/consumptions` },
  { label: 'flows, workflows: list, create', path: '/workflows/workflows' },
  { label: 'flows, workflows: get + graph', path: `/workflows/workflows/${PH_ID}/graph` },
  { label: 'projects: list, crud, apply template', path: '/workflows/projects' },
  { label: 'projects: deploy', path: `/workflows/projects/${PH_ID}/deploy` },
  { label: 'connections: crud, test', path: '/workflows/connections' },
  { label: 'domains: list, get', path: '/organizations/domains' },
  { label: 'instances: list, get', path: '/organizations/instances' },
  { label: 'standards: list, get', path: '/governance/standards' },
  { label: 'connectors: org-level', path: '/connectors/connectors' },
  { label: 'observe: bot status', path: '/observe/bots' },
  { label: 'observe: stream bus resource names (proxy)', path: '/observe/stream-config' },
  { label: 'queues: reader checkpoint (HTTP)', path: '/observe/queues/checkpoint' },
  { label: 'trace: replay / HTTP fallback', path: `/observe/trace/${PH_Q}/events` },
  { label: 'discovery: MCP tool call', path: '/ai/mcp/tools/call' },
  { label: 'thesaurus: terms', path: `/graph/organizations/${PH_ID}/thesaurus` },
  {
    label: 'process_intelligence: decision traces',
    path: `/process-intelligence/organizations/${PH_ID}/decision-traces`,
  },
  {
    label: 'process_intelligence: entity context',
    path: `/process-intelligence/organizations/${PH_ID}/context`,
  },
  { label: 'procedures: list', path: `/process-intelligence/organizations/${PH_ID}/procedures` },
  { label: 'client: rate limit probe', path: '/rate-limits' },
];

function configApiOrigin(apiUrl: string): string {
  const raw = (apiUrl || '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
  } catch {
    return raw.replace(/\/$/, '');
  }
}

/** Resolve an SDK-relative path the same way `LoxtepClient` does (platform vs legacy). Exported for tools/tests. */
export function resolveConfigSdkPath(
  c: Pick<LoxtepConfig, 'api_url' | 'api_path_prefix'>,
  sdkPath: string
): string {
  const hasLegacyPrefix = c.api_path_prefix != null && String(c.api_path_prefix).length > 0;
  const path = sdkPath.startsWith('/') ? sdkPath : `/${sdkPath}`;
  if (hasLegacyPrefix) {
    return `${extendClientBaseUrl(c.api_url || '', c.api_path_prefix).replace(/\/$/, '')}${path}`;
  }
  const origin = configApiOrigin(c.api_url || '');
  if (!origin) return '';
  return buildPlatformRequestUrl(origin, path);
}

/**
 * Fully resolved example URLs the SDK/CLI will call for common operations.
 * Use this to verify `api_url`, `auth_path_prefix`, and `api_path_prefix` match your API Gateway / custom-domain mapping.
 */
export type ResolvedSdkApiPaths = {
  raw_api_url: string;
  /** `platform` = shared host, per-path microservice prefix (default). `legacy` = single `api_path_prefix` baked into the client base URL. */
  loxtep_url_mode: 'platform' | 'legacy';
  post_auth_login: string;
  post_auth_refresh: string;
  loxtep_client_base_url: string;
  post_dataproducts_create: string;
  get_dataproducts_list: string;
  /** Representative SDK path → full URL (see {@link SDK_EXAMPLE_PATHS}; placeholders, not real IDs). */
  example_endpoints: { label: string; sdk_path: string; resolved_url: string }[];
  notes: string[];
};

/**
 * Derive concrete URLs from config (after env/file merge in {@link loadConfig}).
 * - Auth: `buildAuthServiceUrl` → default first segment `app` for `/auth/*` when `auth_path_prefix` is unset.
 * - LoxtepClient (default): `api_url` = API **origin**; data-plane paths are resolved with `buildPlatformRequestUrl` (see `config/platform-request-url.ts`).
 * - Legacy: `api_path_prefix` set → one static `base_url` = `api_url` + that segment (old behavior).
 */
export function resolveSdkApiPaths(
  c: Pick<LoxtepConfig, 'api_url' | 'auth_path_prefix' | 'api_path_prefix'>
): ResolvedSdkApiPaths {
  const raw = (c.api_url || '').trim().replace(/\/$/, '');
  const post_auth_login = buildAuthServiceUrl(raw, c.auth_path_prefix, '/auth/login');
  const post_auth_refresh = buildAuthServiceUrl(raw, c.auth_path_prefix, '/auth/refresh');
  const hasLegacyPrefix = c.api_path_prefix != null && String(c.api_path_prefix).length > 0;
  const loxtep_url_mode: 'platform' | 'legacy' = hasLegacyPrefix ? 'legacy' : 'platform';
  const origin = configApiOrigin(c.api_url || '');
  const loxtep_client_base_url = hasLegacyPrefix
    ? extendClientBaseUrl(c.api_url || '', c.api_path_prefix)
    : origin;
  const post_dataproducts_create = hasLegacyPrefix
    ? `${extendClientBaseUrl(c.api_url || '', c.api_path_prefix).replace(/\/$/, '')}/dataproducts`
    : origin
      ? buildPlatformRequestUrl(origin, '/dataproducts')
      : '';
  const get_dataproducts_list = hasLegacyPrefix
    ? `${extendClientBaseUrl(c.api_url || '', c.api_path_prefix).replace(/\/$/, '')}/dataproducts`
    : origin
      ? buildPlatformRequestUrl(origin, '/dataproducts')
      : '';

  const notes: string[] = [
    'Token refresh in the CLI uses the same `POST` URL as "POST refresh" above (from `loadConfig` + `auth_path_prefix`); TokenManager calls `refresh(apiUrl, token, { auth_path_prefix })`.',
    'Data-product HTTP calls: SDK paths start with `/dataproducts` (see `data-products.ts`).',
  ];
  if (!raw) {
    notes.push('Set `api_url` (or `LOXTEP_API_URL`) to see real URLs.');
  }
  if (hasLegacyPrefix) {
    notes.push(
      `Legacy mode: \`api_path_prefix=${c.api_path_prefix}\` — LoxtepClient uses a single \`base_url\`; paths like \`/dataproducts\` append to that base.`
    );
  } else {
    notes.push(
      'Default **platform** URL resolution: `api_url` is the host **origin** only; `buildPlatformRequestUrl` maps each SDK path (data products double-segment, workflows/projects single prefix, /search via `LOXTEP_PLATFORM_SEARCH_MS`, etc.). See `src/config/platform-request-url.ts`.'
    );
  }
  if (c.auth_path_prefix === undefined) {
    notes.push(
      '`auth_path_prefix` is unset; auth uses the default first segment `app` (app microservice).'
    );
  } else if (c.auth_path_prefix === '') {
    notes.push(
      '`auth_path_prefix` is explicitly empty: auth URLs have no extra segment (use if `api_url` already points at the app service path).'
    );
  }

  const example_endpoints = SDK_EXAMPLE_PATHS.map(({ label, path: sdk_path }) => ({
    label,
    sdk_path,
    resolved_url: resolveConfigSdkPath(c, sdk_path),
  }));

  return {
    raw_api_url: raw,
    loxtep_url_mode,
    post_auth_login,
    post_auth_refresh,
    loxtep_client_base_url: loxtep_client_base_url,
    post_dataproducts_create,
    get_dataproducts_list,
    example_endpoints,
    notes,
  };
}
