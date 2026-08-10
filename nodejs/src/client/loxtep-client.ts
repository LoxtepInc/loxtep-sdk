import type { AwsCredentialIdentity } from '@smithy/types';
import type { LoxtepClientOptions } from './types.js';
import { LoxtepHttpClient, type RateLimitInfo } from '../http/client.js';
import { extendClientBaseUrl } from '../config/api-path.js';
import { createDataProductsApi } from './data-products.js';
import type { DataProductWriterOptions, DataProductReaderOptions } from './data-products.js';
import { createQueuesApi } from './queues.js';
import { createTriggersApi } from './triggers.js';
import { createQualityApi } from './quality.js';
import { createApprovalsApi } from './approvals.js';
import { createCdlcApi } from './cdlc.js';
import { createDeploymentsApi } from './deployments.js';

import { createCatalogApi } from './catalog.js';
import { createSchemasApi } from './schemas.js';
import { createDiscoveryApi } from './discovery.js';
import { createWorkflowsApi } from './workflows.js';
import { createProjectsApi } from './projects.js';
import { createTemplatesApi } from './templates.js';
import { createObserveApi } from './observe.js';
import { createThesaurusApi } from './thesaurus.js';
import { createOntologyApi } from './ontology.js';
import { createPacksApi } from './packs.js';
import { createSemanticLayerApi } from './semantic-layer.js';
import { createProcessIntelligenceApi } from './process-intelligence.js';
import { createTargetsApi } from './targets.js';
import { createConnectorsApi } from './connectors.js';
import { createInstancesApi } from './instances.js';
import { createProceduresApi } from './procedures.js';
import { createDomainsApi } from './domains.js';
import { createStandardsApi } from './standards.js';
import { createPromisesApi } from './promises.js';
import { createImprovementsApi } from './improvements.js';
import { createActivityApi } from './activity.js';
import { createSessionApi } from './session.js';
import { createConnectFacade } from './connect.js';
import { createWorkspaceFacade } from './workspace.js';
import { createBuildFacade } from './build.js';
import { createDefineFacade } from './define.js';
import { createMeaningFacade } from './meaning.js';
import { createReviewFacade } from './review.js';
import { createQueryFacade } from './query.js';
import { createObserveFacade } from './observe-facade.js';
import { createContextFacade } from './context.js';
import { resolveStreamsConfiguration } from '../rstreams/configuration.js';
import { createRStreamsSdk } from '../rstreams/leo-runtime.js';
import type { RStreamsSdk } from '../rstreams/leo-runtime.js';
import { DataProductResolver } from './data-product-resolver.js';
import { requireAutoConfig, resolveAutoConfig, type ExplicitConfigFields } from '../config/workspace-config.js';
import type { FlowWriter } from './flow-types.js';
import type { StreamEvent } from './data-products-types.js';

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
 * Main SDK client. Ten namespaces mirror hosted MCP tool facades:
 * session, connect, workspace, build, define, meaning, review, query, observe, context.
 * Top-level `get_writer` / `get_reader` resolve data products for stream I/O.
 */
export class LoxtepClient {
  readonly api_url: string;
  readonly auth: LoxtepClientOptions['auth'];
  readonly organization_id?: string;
  readonly project_id?: string;
  readonly instance_id?: string;

  private readonly _http: LoxtepHttpClient;
  private readonly _resolver: DataProductResolver;
  private readonly _dataProductsApi: ReturnType<typeof createDataProductsApi>;
  private readonly _workflowsApi: ReturnType<typeof createWorkflowsApi>;
  private _rsdk?: RStreamsSdk;
  private _rsdkResolutionAttempted = false;

  /** Session & org context (MCP: loxtep_session). */
  readonly session: ReturnType<typeof createSessionApi>;

  /** Connectors + templates (MCP: loxtep_connect). */
  readonly connect: ReturnType<typeof createConnectFacade>;

  /** Projects, instances, versions (MCP: loxtep_workspace). */
  readonly workspace: ReturnType<typeof createWorkspaceFacade>;

  /** Workflows, triggers, data products, targets, deploy (MCP: loxtep_build). */
  readonly build: ReturnType<typeof createBuildFacade>;

  /** Schemas, quality, standards, contracts, domains (MCP: loxtep_define). */
  readonly define: ReturnType<typeof createDefineFacade>;

  /** Thesaurus + ontology + packs + semantic search/completeness (MCP: loxtep_meaning). */
  readonly meaning: ReturnType<typeof createMeaningFacade>;

  /** Approvals + improvements + CDLC (MCP: loxtep_review). */
  readonly review: ReturnType<typeof createReviewFacade>;

  /** Catalog, discovery, analytics query (MCP: loxtep_query). */
  readonly query: ReturnType<typeof createQueryFacade>;

  /** Observe status + queue I/O (MCP: loxtep_observe). */
  readonly observe: ReturnType<typeof createObserveFacade>;

  /** Process intelligence, procedures, activity (MCP: loxtep_context). */
  readonly context: ReturnType<typeof createContextFacade>;

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

    const queuesApi = createQueuesApi(this._http, {
      rsdk: this._rsdk,
      get_rsdk: () => this.resolve_stream_sdk(),
    });
    const triggersApi = createTriggersApi(this._http);
    this._workflowsApi = createWorkflowsApi(this._http, {
      rsdk: this._rsdk,
      get_rsdk: () => this.resolve_stream_sdk(),
    });
    const projectsApi = createProjectsApi(this._http);
    const templatesApi = createTemplatesApi(this._http);
    const observeApi = createObserveApi(this._http);
    const deploymentsApi = createDeploymentsApi(this._http);
    this._dataProductsApi = createDataProductsApi(this._http, {
      get_queue_metadata: name => queuesApi.get_queue_metadata(name),
      get_reader_checkpoint: (name, bot_id) => queuesApi.get_reader_checkpoint(name, bot_id),
      rsdk: this._rsdk,
      get_rsdk: () => this.resolve_stream_sdk(),
      resolver: this._resolver,
    });
    const qualityApi = createQualityApi(this._http);
    const approvalsApi = createApprovalsApi(this._http, {
      organization_id: options.organization_id,
    });
    const cdlcApi = createCdlcApi(this._http, {
      organization_id: options.organization_id,
    });
    const catalogApi = createCatalogApi(this._http);
    const discoveryApi = createDiscoveryApi(this._http);
    const schemasApi = createSchemasApi(this._http);
    const thesaurusApi = createThesaurusApi(this._http, options.organization_id);
    const ontologyApi = createOntologyApi(this._http, {
      organization_id: options.organization_id,
    });
    const packsApi = createPacksApi(this._http, {
      organization_id: options.organization_id,
    });
    const semanticApi = createSemanticLayerApi(this._http);
    const processIntelligenceApi = createProcessIntelligenceApi(this._http);
    const targetsApi = createTargetsApi(this._http);
    const connectorsApi = createConnectorsApi(this._http);
    const instancesApi = createInstancesApi(this._http, options.organization_id);
    const proceduresApi = createProceduresApi(this._http);
    const improvementsApi = createImprovementsApi(this._http);
    const activityApi = createActivityApi(this._http);
    const domainsApi = createDomainsApi(this._http);
    const standardsApi = createStandardsApi(this._http);
    const dataContractsApi = createPromisesApi(this._http);

    this.session = createSessionApi(this._http);
    this.connect = createConnectFacade({ connectors: connectorsApi, templates: templatesApi });
    this.workspace = createWorkspaceFacade({
      projects: projectsApi,
      instances: instancesApi,
      deployments: deploymentsApi,
    });
    this.build = createBuildFacade({
      workflows: this._workflowsApi,
      triggers: triggersApi,
      data_products: this._dataProductsApi,
      targets: targetsApi,
    });
    this.define = createDefineFacade({
      schemas: schemasApi,
      quality: qualityApi,
      standards: standardsApi,
      data_contracts: dataContractsApi,
      domains: domainsApi,
    });
    this.meaning = createMeaningFacade({
      thesaurus: thesaurusApi,
      ontology: ontologyApi,
      packs: packsApi,
      semantic: semanticApi,
    });
    this.review = createReviewFacade({
      approvals: approvalsApi,
      improvements: improvementsApi,
      cdlc: cdlcApi,
    });
    this.query = createQueryFacade({
      catalog: catalogApi,
      discovery: discoveryApi,
      data_products: this._dataProductsApi,
    });
    this.observe = createObserveFacade({
      observe: observeApi,
      queues: queuesApi,
      deployments: deploymentsApi,
    });
    this.context = createContextFacade({
      process_intelligence: processIntelligenceApi,
      procedures: proceduresApi,
      activity: activityApi,
    });
    this.metrics = this.createMetricsSurface(options.metrics);
  }

  /** Resolve a data product writer by name or id (delegates to data-products stream logic). */
  async get_writer(
    name_or_id: string,
    options?: DataProductWriterOptions
  ): Promise<FlowWriter> {
    return this._dataProductsApi.get_writer(name_or_id, options);
  }

  /** Resolve a data product reader by name or id (delegates to data-products stream logic). */
  async get_reader(
    name_or_id: string,
    options?: DataProductReaderOptions
  ): Promise<AsyncIterable<StreamEvent>> {
    return this._dataProductsApi.get_reader(name_or_id, options);
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

    const resolved = requireAutoConfig(resolveAutoConfig(explicit, options.cwd));

    if (resolved.resolvedFiles.length > 0) {
      debugLog(
        `[loxtep] Auto-config resolved from: ${resolved.resolvedFiles.join(', ')}`
      );
    } else {
      debugLog('[loxtep] Auto-config: no workspace configuration files found');
    }

    return new LoxtepClient({
      api_url: resolved.api_url!,
      auth: { type: 'jwt', token: resolved.token! },
      project_id: resolved.project_id,
      instance_id: resolved.instance_id,
      organization_id: options.organization_id ?? resolved.organization_id,
      region: options.region ?? resolved.region,
      streams: resolved.streams,
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

    const cachedConfig = this._resolver.getCachedStreamConfig();
    if (cachedConfig) {
      const resolved = resolveStreamsConfiguration(cachedConfig);
      if (resolved) {
        this._rsdk = createRStreamsSdk(resolved);
        return this._rsdk;
      }
    }

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
    return {
      log: (_metric: { id: string; value: number; tags?: Record<string, string> }) => {
        /* stub */
      },
      get_reporter: () => null,
    };
  }
}
