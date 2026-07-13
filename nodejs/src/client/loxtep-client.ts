import type { AwsCredentialIdentity } from '@smithy/types';
import type { LoxtepClientOptions } from './types.js';
import { LoxtepHttpClient, type RateLimitInfo } from '../http/client.js';
import { extendClientBaseUrl } from '../config/api-path.js';
import { createDataProductsApi } from './data-products.js';
import { createQueuesApi } from './queues.js';
import { createTriggersApi } from './triggers.js';
import { createQualityApi } from './quality.js';
import { createCatalogApi } from './catalog.js';
import { createSchemasApi } from './schemas.js';
import { createDiscoveryApi } from './discovery.js';
import { createWorkflowsApi, type WorkflowsApi } from './workflows.js';
import { createProjectsApi } from './projects.js';
import { createTemplatesApi } from './templates.js';
import { createObserveApi } from './observe.js';
import { createThesaurusApi } from './thesaurus.js';
import { createProcessIntelligenceApi } from './process-intelligence.js';
import { createTargetsApi, type TargetsApi } from './targets.js';
import { createConnectorsApi } from './connectors.js';
import { createInstancesApi } from './instances.js';
import { createProceduresApi } from './procedures.js';
import { createDomainsApi } from './domains.js';
import { createStandardsApi } from './standards.js';
import { createPromisesApi } from './promises.js';
import { createImprovementsApi, type ImprovementsApi } from './improvements.js';
import { createActivityApi, type ActivityApi } from './activity.js';
import { resolveStreamsConfiguration } from '../rstreams/configuration.js';
import { createRStreamsSdk } from '../rstreams/leo-runtime.js';
import type { RStreamsSdk } from '../rstreams/leo-runtime.js';
import { DataProductResolver } from './data-product-resolver.js';
import { resolveAutoConfig, type ExplicitConfigFields } from '../config/workspace-config.js';
import { ValidationError } from '../errors/validation.js';

/** Metrics surface: log and get_reporter (optional Loxtep metrics integration). */
export interface MetricsSurface {
  log: (metric: {
    id: string;
    value: number;
    tags?: Record<string, string>;
  }) => void | Promise<void>;
  get_reporter: () => unknown | null;
}

/**
 * Options for `LoxtepClient.fromWorkspace()`.
 * Explicit fields take precedence over workspace-resolved values (R13.3).
 */
export interface FromWorkspaceOptions {
  /** Override the working directory for resolving `.loxtep/project.json`. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Explicit api_url override (takes precedence over workspace files, but env takes precedence over this). */
  api_url?: string;
  /** Explicit project_id override. */
  project_id?: string;
  /** Explicit instance_id override. */
  instance_id?: string;
  /** Explicit auth token override. */
  token?: string;
  /** Optional organization_id. */
  organization_id?: string;
  /** Optional fetch implementation (for tests or custom HTTP). */
  fetch_fn?: typeof fetch;
  /** Optional AWS region. */
  region?: string;
  /** Optional custom debug logger. Defaults to `console.debug`. */
  debug?: (message: string) => void;
}

/**
 * Main SDK client. Public surface uses customer-facing terminology grouped by
 * the ingest → define → deliver journey: triggers, connectors, workflows,
 * data_products (writer/reader), schemas, quality, catalog, discovery, domains,
 * standards, data_contracts, thesaurus, procedures, targets. Plus advanced
 * surfaces: projects, templates, instances, observe, queues, metrics.
 */
export class LoxtepClient {
  readonly api_url: string;
  readonly auth: LoxtepClientOptions['auth'];
  readonly organization_id?: string;
  readonly project_id?: string;
  readonly instance_id?: string;

  private readonly _http: LoxtepHttpClient;
  private readonly _resolver: DataProductResolver;
  private _rsdk?: RStreamsSdk;
  private _rsdkResolutionAttempted = false;

  /** Data products (backend: data products). get, list, search. */
  readonly data_products: ReturnType<typeof createDataProductsApi>;

  /** Workflows (backend: workflows); project-scoped DAG of nodes. list, get (with nodes), create, get_graph, deploy. */
  readonly workflows: WorkflowsApi;

  /** Observe: status (bots / observability). */
  readonly observe: ReturnType<typeof createObserveApi>;

  /** Projects: list, get, create, update, delete (workflows MS). */
  readonly projects: ReturnType<typeof createProjectsApi>;

  /** Templates: list, get (catalog). Apply via projects.apply_template(project_id, body). */
  readonly templates: ReturnType<typeof createTemplatesApi>;

  /** Domains. */
  readonly domains: ReturnType<typeof createDomainsApi>;

  /** Standards (backend: data standards). */
  readonly standards: ReturnType<typeof createStandardsApi>;

  /** Data contracts (backend: datacontracts). */
  readonly data_contracts: ReturnType<typeof createPromisesApi>;

  /** Triggers (ingest source bindings; backend: connections): get, list, create, update, delete, test. */
  readonly triggers: ReturnType<typeof createTriggersApi>;

  /** Queues: get_queue_metadata, get_reader_checkpoint, open_reader, open_writer. */
  readonly queues: ReturnType<typeof createQueuesApi>;

  /** Quality metrics: list, get, create. */
  readonly quality: ReturnType<typeof createQualityApi>;

  /** Catalog (search): search. */
  readonly catalog: ReturnType<typeof createCatalogApi>;

  /** Discovery (MCP tools): search with include_evidence/include_lineage, get_evidence, get_lineage_impact, get_governance_flags, run. */
  readonly discovery: ReturnType<typeof createDiscoveryApi>;

  /** Schemas (data product schema): get, list, tag_pii_fields. */
  readonly schemas: ReturnType<typeof createSchemasApi>;

  /** Thesaurus (canonical correlation keys + aliases): list_terms, resolve_canonical_key, append_synonym. */
  readonly thesaurus: ReturnType<typeof createThesaurusApi>;

  /**
   * @internal
   * Process Intelligence: decisionTraces.list (optional anchor params). LOX-1478.
   * Experimental — excluded from the documented surface.
   */
  readonly process_intelligence: ReturnType<typeof createProcessIntelligenceApi>;

  /** Targets (delivery sink bindings): list, get, create, update, delete. How data products deliver data externally. */
  readonly targets: TargetsApi;

  /** Connectors (organization-level): list, get, create, update, delete, test, get_oauth_url. */
  readonly connectors: ReturnType<typeof createConnectorsApi>;

  /** Instances (organization-level): list, get. */
  readonly instances: ReturnType<typeof createInstancesApi>;

  /** Procedures (process graph): list. */
  readonly procedures: ReturnType<typeof createProceduresApi>;

  /**
   * @internal
   * Improvements (AI Eval self-improvement): list, apply, reject (R8.3–R8.6).
   * Experimental — excluded from the documented surface.
   */
  readonly improvements: ImprovementsApi;

  /**
   * @internal
   * Activity & observability: list activity/audit entries (R7.4, R18.5).
   * Experimental — excluded from the documented surface.
   */
  readonly activity: ActivityApi;

  /** Metrics: log, get_reporter (stub until metrics wiring is added). */
  readonly metrics: MetricsSurface;

  constructor(options: LoxtepClientOptions) {
    const useLegacy = options.url_resolution === 'legacy';
    if (useLegacy) {
      this.api_url = extendClientBaseUrl(options.api_url, options.api_path_prefix);
    } else {
      const raw = options.api_url?.trim() ?? '';
      if (!raw) {
        this.api_url = '';
      } else {
        try {
          this.api_url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
        } catch {
          this.api_url = raw.replace(/\/$/, '');
        }
      }
    }
    this.auth = options.auth;
    this.organization_id = options.organization_id;
    this.project_id = options.project_id;
    this.instance_id = options.instance_id;

    const auth = options.auth;
    const getToken =
      options.get_token ?? (auth.type === 'jwt' ? async () => auth.token : async () => null);
    this._http = new LoxtepHttpClient({
      base_url: this.api_url.replace(/\/$/, ''),
      use_platform_path_resolution: !useLegacy,
      get_token: getToken,
      region: options.region,
      fetch_fn: options.fetch_fn,
      credentials: options.credentials,
      refresh_auth: options.refresh_auth,
    });
    this._resolver = new DataProductResolver(this._http, options.instance_id);
    const busPartial = options.streams ?? options.rstreams;
    const prebuiltSdk = options.streams_sdk ?? options.rstreams_sdk;
    const streamResourcesResolved = prebuiltSdk
      ? undefined
      : resolveStreamsConfiguration(busPartial);
    this._rsdk =
      prebuiltSdk ??
      (streamResourcesResolved ? createRStreamsSdk(streamResourcesResolved) : undefined);
    this.queues = createQueuesApi(this._http, {
      rsdk: this._rsdk,
      get_rsdk: () => this.resolve_stream_sdk(),
    });
    this.triggers = createTriggersApi(this._http);
    this.workflows = createWorkflowsApi(this._http, {
      rsdk: this._rsdk,
      get_rsdk: () => this.resolve_stream_sdk(),
    });
    this.projects = createProjectsApi(this._http);
    this.templates = createTemplatesApi(this._http);
    this.observe = createObserveApi(this._http);
    this.data_products = createDataProductsApi(this._http, {
      get_queue_metadata: name => this.queues.get_queue_metadata(name),
      get_reader_checkpoint: (name, bot_id) => this.queues.get_reader_checkpoint(name, bot_id),
      rsdk: this._rsdk,
      get_rsdk: () => this.resolve_stream_sdk(),
      resolver: this._resolver,
    });
    this.quality = createQualityApi(this._http);
    this.catalog = createCatalogApi(this._http);
    this.discovery = createDiscoveryApi(this._http);
    this.schemas = createSchemasApi(this._http);
    this.thesaurus = createThesaurusApi(this._http, options.organization_id);
    this.process_intelligence = createProcessIntelligenceApi(this._http);
    this.targets = createTargetsApi(this._http);
    this.connectors = createConnectorsApi(this._http);
    this.instances = createInstancesApi(this._http, options.organization_id);
    this.procedures = createProceduresApi(this._http);
    this.improvements = createImprovementsApi(this._http);
    this.activity = createActivityApi(this._http);
    this.domains = createDomainsApi(this._http);
    this.standards = createStandardsApi(this._http);
    this.data_contracts = createPromisesApi(this._http);
    this.metrics = this.createMetricsSurface(options.metrics);
  }

  /** Update SigV4 credentials used by the HTTP layer (e.g. CLI after refresh returns STS). */
  set_aws_credentials(credentials: AwsCredentialIdentity | null): void {
    this._http.setAwsCredentials(credentials);
  }

  /**
   * Construct a `LoxtepClient` from workspace context files (R13.1, R13.4).
   *
   * Resolution precedence: env vars > explicit options > `.loxtep/project.json` + `~/.loxtep/credentials.json`.
   *
   * Checks for required workspace files only when called. If a required file is
   * missing, throws a `ValidationError` naming the missing file (R13.4).
   *
   * Emits a debug log naming which configuration files were resolved (R13.2).
   *
   * @param options - Optional overrides and configuration.
   * @returns A configured `LoxtepClient` instance.
   * @throws {ValidationError} when a required workspace file is absent.
   */
  static fromWorkspace(options: FromWorkspaceOptions = {}): LoxtepClient {
    const debugLog = options.debug ?? console.debug;
    const explicit: ExplicitConfigFields = {
      api_url: options.api_url,
      project_id: options.project_id,
      instance_id: options.instance_id,
      token: options.token,
    };

    const resolved = resolveAutoConfig(explicit, options.cwd);

    // R13.2: Emit debug log naming resolved files
    if (resolved.resolvedFiles.length > 0) {
      debugLog(
        `[loxtep] Auto-config resolved from: ${resolved.resolvedFiles.join(', ')}`
      );
    } else {
      debugLog('[loxtep] Auto-config: no workspace configuration files found');
    }

    // R13.4: Check required files — api_url and token must be resolvable
    // If api_url is not resolved from any source, check which file is missing
    if (!resolved.api_url) {
      // Determine which file would have provided api_url
      const missingProjectFile = resolved.missingFiles.find(f => f.includes('project.json'));
      if (missingProjectFile) {
        throw new ValidationError(
          `Cannot auto-configure: required file is missing: ${missingProjectFile}`,
          [{ field: 'api_url', message: `File not found: ${missingProjectFile}` }]
        );
      }
      throw new ValidationError(
        'Cannot auto-configure: api_url could not be resolved from workspace files, environment, or explicit config',
        [{ field: 'api_url', message: 'No api_url available' }]
      );
    }

    if (!resolved.token) {
      // Token comes from credentials.json
      const missingCredFile = resolved.missingFiles.find(f => f.includes('credentials.json'));
      if (missingCredFile) {
        throw new ValidationError(
          `Cannot auto-configure: required file is missing: ${missingCredFile}`,
          [{ field: 'token', message: `File not found: ${missingCredFile}` }]
        );
      }
      throw new ValidationError(
        'Cannot auto-configure: auth token could not be resolved from workspace files, environment, or explicit config',
        [{ field: 'token', message: 'No auth token available' }]
      );
    }

    return new LoxtepClient({
      api_url: resolved.api_url,
      auth: { type: 'jwt', token: resolved.token },
      project_id: resolved.project_id,
      instance_id: resolved.instance_id,
      organization_id: options.organization_id,
      region: options.region,
      fetch_fn: options.fetch_fn,
    });
  }

  /**
   * Lazily resolve the stream bus SDK. Resolution priority:
   * 1. If `streams` was passed in constructor options → already set as this._rsdk (instant return)
   * 2. If a data product resolution has cached stream config → use that
   * 3. Fall back to GET /instances/{id}/stream-config using the client's instance_id
   * 4. observe.stream_config() remains available as a last-resort fallback
   *
   * Caches the result (or the failure) so subsequent calls are instant.
   */
  async resolve_stream_sdk(): Promise<RStreamsSdk | undefined> {
    if (this._rsdk) return this._rsdk;
    if (this._rsdkResolutionAttempted) return undefined;
    this._rsdkResolutionAttempted = true;

    // Priority 2: Check if the resolver has any cached stream config from a prior data product resolution
    // (This covers the case where get_writer/get_reader was called first and cached the config)
    const cachedConfig = this._resolver.getCachedStreamConfig();
    if (cachedConfig) {
      const resolved = resolveStreamsConfiguration(cachedConfig);
      if (resolved) {
        this._rsdk = createRStreamsSdk(resolved);
        return this._rsdk;
      }
    }

    // Priority 3: Resolve from instance record via GET /organizations/instances/{id}/stream-config
    if (this.instance_id) {
      try {
        const streamConfigRes = await this._http.get<{ success: true; data: Record<string, string> }>(
          `/organizations/instances/${encodeURIComponent(this.instance_id)}/stream-config`
        );
        if (streamConfigRes?.data && typeof streamConfigRes.data === 'object') {
          const resolved = resolveStreamsConfiguration(
            streamConfigRes.data as Partial<Parameters<typeof resolveStreamsConfiguration>[0] & object>
          );
          if (resolved) {
            this._rsdk = createRStreamsSdk(resolved);
            return this._rsdk;
          }
        }
      } catch {
        // Instance stream-config endpoint may not be available; fall through to observe
      }
    }

    // Priority 4 (deprecated fallback): observe.stream_config()
    try {
      const remoteConfig = await this.observe.stream_config();
      if (remoteConfig && typeof remoteConfig === 'object') {
        const resolved = resolveStreamsConfiguration(
          remoteConfig as Partial<Parameters<typeof resolveStreamsConfiguration>[0] & object>
        );
        if (resolved) {
          this._rsdk = createRStreamsSdk(resolved);
          return this._rsdk;
        }
      }
    } catch {
      // observe.stream_config() may not be available (permissions, no instance, etc.)
    }
    return undefined;
  }

  /** Rate limit info from last response headers or from GET /rate-limits if available. */
  async get_rate_limits(): Promise<RateLimitInfo | null> {
    try {
      const res = await this._http.get<{
        limit?: number;
        remaining?: number;
        reset_at?: string;
        retry_after_seconds?: number;
      }>('/rate-limits');
      if (res && typeof res === 'object' && ('limit' in res || 'remaining' in res)) {
        const r = res as Record<string, unknown>;
        return {
          limit: typeof r.limit === 'number' ? r.limit : 0,
          remaining: typeof r.remaining === 'number' ? r.remaining : 0,
          reset_at: typeof r.reset_at === 'string' ? r.reset_at : new Date().toISOString(),
          retry_after_seconds:
            typeof r.retry_after_seconds === 'number' ? r.retry_after_seconds : undefined,
        };
      }
    } catch {
      // No dedicated /rate-limits endpoint; use last headers
    }
    return this._http.getLastRateLimit();
  }

  private createMetricsSurface(metricsOpts?: LoxtepClientOptions['metrics']): MetricsSurface {
    if (!metricsOpts?.enabled) {
      return {
        log: () => {
          /* no-op when metrics disabled */
        },
        get_reporter: () => null,
      };
    }
    // Stub: optional metrics reporter can be wired later
    return {
      log: (_metric: { id: string; value: number; tags?: Record<string, string> }) => {
        /* stub */
      },
      get_reporter: () => null,
    };
  }
}
