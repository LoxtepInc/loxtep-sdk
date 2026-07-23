import { loadConfig } from '../../config/load.js';
import { loadCliConfig } from '../load-cli-config.js';
import { resolveCliApiUrl } from '../resolve-api-url.js';
import { resolveCliAccessToken } from '../auth-resolve.js';
import { saveConfig } from '../../config/save.js';
import type { LoxtepConfig } from '../../config/types.js';
import { resolveSdkApiPaths } from '../../config/resolve-sdk-urls.js';
import { requireCliClient } from '../create-cli-client.js';

const ALLOWED_KEYS: (keyof LoxtepConfig)[] = [
  'api_url',
  'auth_path_prefix',
  'api_path_prefix',
  'organization_id',
  'project_id',
  'instance_id',
  'region',
];

/**
 * Run config list: print current config (api_url, organization_id, project_id, instance_id).
 */
export async function runConfigPaths(): Promise<void> {
  const config = await loadConfig();
  const p = resolveSdkApiPaths(config);
  console.log('Resolved API paths (what the SDK would call with this config):\n');
  console.log('  api_url (normalized):     ', p.raw_api_url || '(not set)');
  console.log('  LoxtepClient URL mode     ', p.loxtep_url_mode);
  console.log('  POST /auth/login         ', p.post_auth_login);
  console.log('  POST /auth/refresh       ', p.post_auth_refresh);
  console.log('  LoxtepClient base (origin) ', p.loxtep_client_base_url || '(empty)');
  console.log('  POST create data product ', p.post_dataproducts_create);
  console.log('  GET list data products   ', p.get_dataproducts_list);
  console.log(
    `\nLoxtepClient — ${p.example_endpoints.length} SDK paths → full URL (placeholders for ids/queue; same resolution as the HTTP client):`
  );
  const w = Math.max(36, ...p.example_endpoints.map(e => e.label.length));
  for (const e of p.example_endpoints) {
    const line = e.label.length > w ? `${e.label.slice(0, w - 1)}…` : e.label.padEnd(w);
    console.log(`  ${line}  ${e.sdk_path}`);
    console.log(`${''.padEnd(2 + w)}  → ${e.resolved_url || '(set api_url)'}`);
  }
  console.log('\nNotes:');
  for (const n of p.notes) {
    console.log('  •', n);
  }
}

/**
 * Run config list: print current config (api_url, organization_id, project_id, instance_id).
 */
export async function runConfigList(): Promise<void> {
  const { config, workspace_api_url, resolvedWorkspaceFiles } = await loadCliConfig();
  const authResolved = await resolveCliAccessToken({ cwd: process.cwd() });
  const platformApiUrl = resolveCliApiUrl(config, authResolved);

  console.log('api_url:', platformApiUrl || config.api_url || '(not set)');
  if (
    workspace_api_url &&
    workspace_api_url.replace(/\/$/, '') !== (platformApiUrl || config.api_url || '').replace(/\/$/, '')
  ) {
    console.log(
      'workspace_api_url:',
      workspace_api_url,
      '(from .loxtep/project.json — instance gateway set by attach)'
    );
  }
  console.log('auth_path_prefix:', config.auth_path_prefix ?? '(default: app, for /auth/login)');
  console.log(
    'api_path_prefix:',
    config.api_path_prefix ?? '(not set; default platform URL resolution)'
  );
  console.log('organization_id:', config.organization_id ?? '(not set)');
  console.log('project_id:', config.project_id ?? '(not set)');
  console.log('instance_id:', config.instance_id ?? '(not set)');
  console.log('region:', config.region ?? '(not set; default SigV4 region in HTTP client applies)');
  const projectFile = resolvedWorkspaceFiles.find(f => f.includes('project.json'));
  if (config.streams && Object.keys(config.streams).length > 0) {
    const source = projectFile ? 'from .loxtep/project.json (attach or manual)' : 'from ~/.loxtep/config.json';
    console.log(`streams: (set — ${source}; PascalCase keys, merged with LEO_* env)`);
  } else {
    console.log(
      'streams:',
      '(not set; run `loxtep attach` to populate from stream-config, or set ~/.loxtep/config.json / LEO_* env)'
    );
  }
  if (projectFile) {
    console.log('workspace:', projectFile);
  } else {
    console.log(
      'workspace:',
      '(no .loxtep/project.json found — run `loxtep init` in this directory)'
    );
  }
}

/**
 * Run config set <key> <value>: update one config key and save to file.
 */
export async function runConfigSet(key: string, value: string): Promise<void> {
  const k = key as keyof LoxtepConfig;
  if (!ALLOWED_KEYS.includes(k)) {
    console.error(`Invalid key. Allowed: ${ALLOWED_KEYS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const config = await loadConfig();
  const updated: Partial<LoxtepConfig> = { ...config, [k]: value || undefined };
  await saveConfig(updated);
  console.log(`${key} set to ${value || '(cleared)'}`);
}

/**
 * SDK connector config shape returned in `metadata.sdk_config`.
 */
export interface SdkConfig {
  api_url: string;
  organization_id: string;
  project_id?: string;
  instance_id?: string;
  region?: string;
}

export interface ConfigExportOptions {
  configFilePath?: string;
  credentialsPath?: string;
  /** 'sh' = POSIX exports; 'json' = single JSON object for apps; 'env' = .env file format. */
  format?: 'sh' | 'json' | 'env';
}

/**
 * Full config export shape for --from-data-product.
 * Includes control plane identifiers, bot/queue bindings, and all stream bus resource names.
 */
export interface DataProductExportConfig {
  api_url: string;
  organization_id: string;
  project_id: string;
  instance_id: string;
  region: string;
  bot_id: string;
  input_queue_name: string;
  output_queue_name: string;
  LeoEvent: string;
  LeoStream: string;
  LeoCron: string;
  LeoS3: string;
  LeoKinesisStream: string;
  LeoFirehoseStream: string;
  LeoSettings: string;
}

/**
 * Build the full key-value entries for a DataProductExportConfig.
 * Keys use UPPER_SNAKE_CASE with LOXTEP_ prefix for identifiers and LEO_ prefix for stream resources.
 */
export function dataProductExportToEntries(cfg: DataProductExportConfig): [string, string][] {
  return [
    ['LOXTEP_API_URL', cfg.api_url],
    ['LOXTEP_ORGANIZATION_ID', cfg.organization_id],
    ['LOXTEP_PROJECT_ID', cfg.project_id],
    ['LOXTEP_INSTANCE_ID', cfg.instance_id],
    ['LOXTEP_REGION', cfg.region],
    ['LOXTEP_BOT_ID', cfg.bot_id],
    ['LOXTEP_INPUT_QUEUE_NAME', cfg.input_queue_name],
    ['LOXTEP_OUTPUT_QUEUE_NAME', cfg.output_queue_name],
    ['LEO_EVENT', cfg.LeoEvent],
    ['LEO_STREAM', cfg.LeoStream],
    ['LEO_CRON', cfg.LeoCron],
    ['LEO_S3', cfg.LeoS3],
    ['LEO_KINESIS_STREAM', cfg.LeoKinesisStream],
    ['LEO_FIREHOSE_STREAM', cfg.LeoFirehoseStream],
    ['LEO_SETTINGS', cfg.LeoSettings],
  ];
}

/**
 * Format a DataProductExportConfig as POSIX shell export lines.
 */
export function formatDataProductExportAsShell(cfg: DataProductExportConfig): string {
  return dataProductExportToEntries(cfg)
    .map(([k, v]) => `export ${k}="${v}"`)
    .join('\n');
}

/**
 * Format a DataProductExportConfig as a JSON object.
 */
export function formatDataProductExportAsJson(cfg: DataProductExportConfig): string {
  return JSON.stringify(cfg, null, 2);
}

/**
 * Format a DataProductExportConfig as .env file lines (no `export` prefix).
 */
export function formatDataProductExportAsEnv(cfg: DataProductExportConfig): string {
  return dataProductExportToEntries(cfg)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

/**
 * Resolve a data product's full runtime configuration (deployment bindings + stream bus resources)
 * and print in the requested format.
 *
 * Resolution chain:
 * 1. Resolve data product by ID or name
 * 2. Extract deployment_bindings (bot_id, queue_name, instance_id)
 * 3. Resolve stream config from instance via GET /instances/{id}/stream-config
 *
 * Errors:
 * - Data product not found → exit 1
 * - Data product not deployed (no deployment_bindings) → exit 1 with deployment hint
 * - Stream config resolution failure → exit 1
 */
export async function runConfigExportFromDataProduct(
  dataProductIdOrName: string,
  options: ConfigExportOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);

  // Step 1: Resolve the data product (by UUID or name search)
  let dp;
  try {
    dp = await client.build.data_products.get(dataProductIdOrName);
  } catch {
    // If direct get fails (likely not a UUID), try searching by name
    try {
      const listResult = await client.build.data_products.list({ search: dataProductIdOrName });
      const matches = listResult.items.filter(
        (item: { name: string }) => item.name === dataProductIdOrName
      );
      if (matches.length === 0) {
        console.error(
          `Error: Data product '${dataProductIdOrName}' not found. Verify the name or ID is correct and that the workflow has been deployed.`
        );
        process.exitCode = 1;
        return;
      }
      if (matches.length > 1) {
        console.error(
          `Error: Multiple data products match name '${dataProductIdOrName}'. Specify an instance_id in config or use the data product UUID directly.`
        );
        process.exitCode = 1;
        return;
      }
      dp = matches[0];
    } catch (searchErr: unknown) {
      const msg = searchErr instanceof Error ? searchErr.message : String(searchErr);
      console.error(`Error: Could not resolve data product '${dataProductIdOrName}'. ${msg}`);
      process.exitCode = 1;
      return;
    }
  }

  // Step 2: Check deployment bindings
  const bindings = (
    dp as { deployment_bindings?: { instance_id?: string; deployment_id?: string; bot_id?: string; queue_name?: string } }
  ).deployment_bindings;
  if (!bindings?.queue_name || !bindings?.bot_id || !bindings?.instance_id) {
    console.error(
      `Error: Data product '${dp.name}' is not deployed. Deploy the workflow first using 'loxtep workflows deploy' or the deploy_workflow MCP tool.`
    );
    process.exitCode = 1;
    return;
  }

  // Step 3: Resolve stream config from the instance
  let streamConfig: {
    Region: string;
    LeoEvent: string;
    LeoStream: string;
    LeoCron: string;
    LeoS3: string;
    LeoKinesisStream: string;
    LeoFirehoseStream: string;
    LeoSettings: string;
  };
  try {
    streamConfig = await client.workspace.instances.get_stream_config(bindings.instance_id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `Error: Failed to resolve stream bus configuration for instance '${bindings.instance_id}'. ${msg}`
    );
    process.exitCode = 1;
    return;
  }

  // Build the full export config
  const api = client.api_url.replace(/\/$/, '');
  const org = config.organization_id ?? dp.organization_id;
  const proj = config.project_id ?? dp.project_id ?? '';

  const exportConfig: DataProductExportConfig = {
    api_url: api,
    organization_id: org,
    project_id: proj,
    instance_id: bindings.instance_id,
    region: streamConfig.Region,
    bot_id: bindings.bot_id,
    input_queue_name: bindings.queue_name,
    output_queue_name: bindings.queue_name,
    LeoEvent: streamConfig.LeoEvent,
    LeoStream: streamConfig.LeoStream,
    LeoCron: streamConfig.LeoCron,
    LeoS3: streamConfig.LeoS3,
    LeoKinesisStream: streamConfig.LeoKinesisStream,
    LeoFirehoseStream: streamConfig.LeoFirehoseStream,
    LeoSettings: streamConfig.LeoSettings,
  };

  const fmt = options.format ?? 'sh';
  switch (fmt) {
    case 'json':
      console.log(formatDataProductExportAsJson(exportConfig));
      break;
    case 'env':
      console.log(formatDataProductExportAsEnv(exportConfig));
      break;
    case 'sh':
    default:
      console.log(formatDataProductExportAsShell(exportConfig));
      break;
  }
}

/* ------------------------------------------------------------------ */
/*  Config export formatting helpers (exported for property tests)    */
/* ------------------------------------------------------------------ */

/**
 * Build the env-var key-value map from an SdkConfig.
 * Keys use the LOXTEP_ prefix and UPPER_SNAKE_CASE convention.
 */
function sdkConfigToEnvEntries(config: SdkConfig): [string, string][] {
  const entries: [string, string][] = [];
  entries.push(['LOXTEP_API_URL', config.api_url]);
  entries.push(['LOXTEP_ORGANIZATION_ID', config.organization_id]);
  if (config.project_id != null) entries.push(['LOXTEP_PROJECT_ID', config.project_id]);
  if (config.instance_id != null) entries.push(['LOXTEP_INSTANCE_ID', config.instance_id]);
  if (config.region != null) entries.push(['LOXTEP_REGION', config.region]);
  return entries;
}

/**
 * Format an SdkConfig as POSIX shell export lines.
 * Example: `export LOXTEP_API_URL="https://api.loxtep.io"`
 */
export function formatSdkConfigAsShell(config: SdkConfig): string {
  return sdkConfigToEnvEntries(config)
    .map(([k, v]) => `export ${k}="${v}"`)
    .join('\n');
}

/**
 * Format an SdkConfig as a JSON object mapping field names to values.
 */
export function formatSdkConfigAsJson(config: SdkConfig): string {
  const obj: Record<string, string> = {};
  obj.api_url = config.api_url;
  obj.organization_id = config.organization_id;
  if (config.project_id != null) obj.project_id = config.project_id;
  if (config.instance_id != null) obj.instance_id = config.instance_id;
  if (config.region != null) obj.region = config.region;
  return JSON.stringify(obj, null, 2);
}

/**
 * Format an SdkConfig as .env file lines (no `export` prefix).
 * Example: `LOXTEP_API_URL=https://api.loxtep.io`
 */
export function formatSdkConfigAsEnv(config: SdkConfig): string {
  return sdkConfigToEnvEntries(config)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/*  config export --from-connector                                    */
/* ------------------------------------------------------------------ */

/**
 * Fetch an SDK connector and output its sdk_config in the requested format.
 *
 * Errors:
 * - Connector not found → exit 1
 * - Connector is not `connector_type: "sdk"` → exit 1
 */
export async function runConfigExportFromConnector(
  connectorId: string,
  options: ConfigExportOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);

  let connector;
  try {
    connector = await client.connect.connectors.get(connectorId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Connector '${connectorId}' not found. ${msg}`);
    process.exitCode = 1;
    return;
  }

  if (connector.connector_type !== 'sdk') {
    console.error(
      `Error: Connector '${connectorId}' is type '${connector.connector_type}', not 'sdk'. Use --from-data-product for non-SDK connectors.`
    );
    process.exitCode = 1;
    return;
  }

  const sdkConfig = (connector.metadata as Record<string, unknown>)?.sdk_config as
    | SdkConfig
    | undefined;
  if (!sdkConfig || !sdkConfig.api_url || !sdkConfig.organization_id) {
    console.error(
      `Error: Connector '${connectorId}' is missing sdk_config in metadata. The connector may need to be recreated.`
    );
    process.exitCode = 1;
    return;
  }

  const fmt = options.format ?? 'sh';
  switch (fmt) {
    case 'json':
      console.log(formatSdkConfigAsJson(sdkConfig));
      break;
    case 'env':
      console.log(formatSdkConfigAsEnv(sdkConfig));
      break;
    case 'sh':
    default:
      console.log(formatSdkConfigAsShell(sdkConfig));
      break;
  }
}

export async function runInit(): Promise<void> {
  console.log(`Loxtep CLI — setup checklist:

  Config is stored at ~/.loxtep/config.json. Auth tokens default to ./.loxtep/credentials.json (use loxtep login --global for ~/.loxtep/credentials.json).

  1. loxtep config set api_url <https://your-api-host>   (host only; no trailing /app)
  2. loxtep login   (stores credentials at ./.loxtep/credentials.json by default; or set LOXTEP_AUTH_TOKEN env var)
  3. (Legacy only) loxtep config set api_path_prefix <one ms>  if you must pin a single microservice base URL (LOXTEP_API_PATH_PREFIX); default is per-path platform routing
  4. Optional: loxtep config set organization_id <uuid> | project_id <uuid> | instance_id <uuid> | region <aws-region>
     (saved to ~/.loxtep/config.json; used as defaults for LoxtepClient constructor)
  5. Stream bus: add a \`streams\` object (PascalCase keys) to ~/.loxtep/config.json and/or LEO_* env; see docs/sdk-control-vs-data-plane.md
  6. From a connector: loxtep config export --from-connector <uuid>
     From a data product: loxtep config export --from-data-product <uuid>

  Auth precedence: LOXTEP_AUTH_TOKEN env var → ./.loxtep/credentials.json (walk up from cwd) → ~/.loxtep/credentials.json.
  Docs: package docs/sdk-pairing.md and docs/sdk-control-vs-data-plane.md (npm pack path: node_modules/@loxtep/sdk/docs/...).
`);
}
