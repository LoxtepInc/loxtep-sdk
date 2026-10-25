/**
 * Data products API (backend: data products). get, list, search, get_queue_info, get_reader_checkpoint,
 * get_writer, get_reader, invalidate_cache.
 * Customer-facing surface: data_products.
 */

import type { RStreamsSdk } from '../rstreams/leo-runtime.js';
import type { LoxtepHttpClient } from '../http/client.js';
import type {
  DataProduct,
  DataProductsListFilters,
  DataProductGetOptions,
  DataProductsListResponse,
  DataProductsSearchResponse,
  DataProductStreamOptions,
  DataProductReplayOptions,
  StreamEvent,
  DataProductQueryResult,
  DataProductQueryReceipt,
  DataProductExportOptions,
  DataProductExportResult,
  IcebergRebuildRequest,
  DataProductListTablesResult,
  DataProductLexicon,
  DataProductCreateInput,
  UsageMapResponse,
  DataProductPromotionReadiness,
  DataProductPromotionResult,
  SemanticInferencePromoteInput,
} from './data-products-types.js';
import { WarehouseQueryError } from './data-products-types.js';
import type { QueueMetadata, ReaderCheckpoint } from './queue-types.js';
import type { FlowWriter } from './flow-types.js';
import {
  readQueueBatch,
  createQueueWriter,
  type ReadQueueBatchResult,
} from '../rstreams/event-bridge.js';
import { NotFoundError } from '../errors/resource.js';
import { AuthorizationError } from '../errors/auth.js';
import { StreamingError } from '../errors/streaming.js';
import { DataProductResolver } from './data-product-resolver.js';
import { resolveStreamsConfiguration } from '../rstreams/configuration.js';
import { createRStreamsSdk } from '../rstreams/leo-runtime.js';

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      search.set(k, v.join(','));
    } else {
      search.set(k, String(v));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function queueNameFromDeploymentBindings(asset: DataProduct): string | undefined {
  const raw = asset.deployment_bindings?.queue_name;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface DataProductsApiDeps {
  get_queue_metadata: (queue_name: string) => Promise<QueueMetadata>;
  get_reader_checkpoint: (queue_name: string, bot_id: string) => Promise<ReaderCheckpoint>;
  /** When set with stream({ bot_id }), live tail uses the stream bus instead of HTTP observe. */
  rsdk?: RStreamsSdk;
  /** Lazy stream runtime resolver (attempts observe.stream_config() when rsdk is not set). */
  get_rsdk?: () => Promise<RStreamsSdk | undefined>;
  /** DataProductResolver instance for get_writer/get_reader resolution chain. */
  resolver?: DataProductResolver;
}

/** Options for data_products.get_writer(). */
export interface DataProductWriterOptions {
  /** Override the deployment-resolved bot_id. */
  bot_id?: string;
  /** Maximum number of events per batch when flushing. Default: 100. */
  batch_size?: number;
  /** Maximum retry attempts for transient write failures. Default: 3. */
  max_retries?: number;
}

/** Options for data_products.get_reader(). */
export interface DataProductReaderOptions {
  /** Override the default reader bot_id (default: `sdk-reader-{dp_name}`). */
  bot_id?: string;
  /** Start position/checkpoint for reading. */
  from?: string;
  /** Maximum number of events per batch. Default: 100. */
  batch_size?: number;
}

function unwrapRecord(res: unknown): Record<string, unknown> {
  if (!res || typeof res !== 'object' || Array.isArray(res)) return {};
  const record = res as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return record.data as Record<string, unknown>;
  }
  return record;
}

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function semanticInferencePath(id: string): string {
  return `/dataproducts/dataproducts/${encodeURIComponent(id)}/semantic-inference`;
}

function eventIdentity(event: StreamEvent | undefined): string | null {
  if (!event) return null;
  const record = event as Record<string, unknown>;
  for (const key of ['eid', 'event_id', 'id']) {
    if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  }
  return null;
}

/**
 * Create the data_products API surface (get, list, search, query, list_tables, get_queue_info, get_reader_checkpoint, stream, replay, get_writer, get_reader, invalidate_cache).
 */
export function createDataProductsApi(
  http: LoxtepHttpClient,
  deps?: DataProductsApiDeps
): {
  get: (id: string, options?: DataProductGetOptions) => Promise<DataProduct>;
  get_lexicon: (id: string) => Promise<DataProductLexicon>;
  list: (filters?: DataProductsListFilters) => Promise<DataProductsListResponse['data']>;
  search: (
    query: string,
    filters?: { type?: string; limit?: number; offset?: number }
  ) => Promise<DataProductsSearchResponse>;
  query: (id: string, sql: string) => Promise<DataProductQueryResult>;
  query_receipt: (id: string, sql: string) => Promise<DataProductQueryReceipt>;
  export_events: (id: string, options?: DataProductExportOptions) => Promise<DataProductExportResult>;
  iceberg: {
    rebuild: (id: string, body: IcebergRebuildRequest) => Promise<Record<string, unknown>>;
    health: (id: string) => Promise<Record<string, unknown>>;
    status: (id: string) => Promise<Record<string, unknown>>;
    cancel: (id: string) => Promise<Record<string, unknown>>;
    enable: (id: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
    put_config: (id: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
    files: (id: string) => Promise<Record<string, unknown>>;
    snapshots: (id: string) => Promise<Record<string, unknown>>;
  };
  list_tables: (id: string) => Promise<DataProductListTablesResult>;
  get_queue_info: (id: string) => Promise<QueueMetadata>;
  get_reader_checkpoint: (id: string, bot_id: string) => Promise<ReaderCheckpoint>;
  create: (body: DataProductCreateInput) => Promise<DataProduct>;
  get_usage_map: () => Promise<UsageMapResponse>;
  stream: (id: string, options?: DataProductStreamOptions) => AsyncIterable<StreamEvent>;
  replay: (id: string, options?: DataProductReplayOptions) => AsyncIterable<StreamEvent>;
  get_writer: (idOrName: string, options?: DataProductWriterOptions) => Promise<FlowWriter>;
  get_reader: (idOrName: string, options?: DataProductReaderOptions) => Promise<AsyncIterable<StreamEvent>>;
  invalidate_cache: (idOrName?: string) => void;
  readiness: (data_product_id: string) => Promise<DataProductPromotionReadiness>;
  promote: (
    data_product_id: string,
    target_tier: 'silver' | 'gold'
  ) => Promise<DataProductPromotionResult>;
  semantic_inference: {
    request: (id: string) => Promise<unknown>;
    get: (id: string) => Promise<unknown>;
    promote: (id: string, body: SemanticInferencePromoteInput) => Promise<unknown>;
  };
} {
  return {
    async get(id: string, options?: DataProductGetOptions): Promise<DataProduct> {
      const qs = options
        ? buildQueryString({
            include_schema: options.include_schema,
            include_quality: options.include_quality,
            include_lineage: options.include_lineage,
            include_contracts: options.include_contracts,
          })
        : '';
      const res = await http.get<{ success: true; data: DataProduct }>(
        `/dataproducts/${encodeURIComponent(id)}${qs}`
      );
      return res.data;
    },

    /**
     * Get the glossary/lexicon (definitions) for a data product.
     * Returns glossary_terms (term -> { definition, alt_labels?, broader?, narrower?, related? }) and field_glossary_map.
     */
    async get_lexicon(id: string): Promise<DataProductLexicon> {
      const asset = await this.get(id);
      const glossary_terms =
        (asset as DataProduct & { glossary_terms?: DataProductLexicon['glossary_terms'] })
          .glossary_terms ??
        (asset.metadata?.business_glossary as DataProductLexicon['glossary_terms']) ??
        {};
      const field_glossary_map =
        (asset.metadata?.field_glossary_map as DataProductLexicon['field_glossary_map']) ??
        undefined;
      return { glossary_terms, field_glossary_map };
    },

    async list(filters?: DataProductsListFilters): Promise<DataProductsListResponse['data']> {
      const params: Record<string, string | number | boolean | undefined> = {
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 100,
        sort_by: filters?.sort_by ?? 'created_at',
        sort_order: filters?.sort_order ?? 'desc',
      };
      if (filters?.domain_id) params.domain_id = filters.domain_id;
      if (filters?.status) params.status = filters.status;
      if (filters?.kind) params.kind = filters.kind;
      if (filters?.classification) params.classification = filters.classification;
      if (filters?.owner_user_id) params.owner_user_id = filters.owner_user_id;
      if (filters?.search) params.search = filters.search;
      if (filters?.tags?.length) params.tags = filters.tags.join(',');
      const qs = buildQueryString(params);
      const res = await http.get<DataProductsListResponse>(`/dataproducts${qs}`);
      return res.data;
    },

    async search(
      query: string,
      filters?: { type?: string; limit?: number; offset?: number }
    ): Promise<DataProductsSearchResponse> {
      const params: Record<string, string | number | undefined> = {
        q: query,
        type: filters?.type ?? 'data_product',
        limit: filters?.limit ?? 20,
        offset: filters?.offset ?? 0,
      };
      const qs = buildQueryString(params);
      return http.get<DataProductsSearchResponse>(`/search${qs}`);
    },

    async query_receipt(id: string, sql: string): Promise<DataProductQueryReceipt> {
      const res = await http.post<Record<string, unknown>>('/dataproducts/warehouse/execute', {
        sql,
        data_product_ids_hint: [id],
      });
      const wrapped = res.data;
      const body =
        wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)
          ? (wrapped as Record<string, unknown>)
          : res;
      const status = typeof body.status === 'string' && body.status.length > 0 ? body.status : undefined;
      const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
      const columns = Array.isArray(body.columns)
        ? body.columns.map(column => String(column))
        : undefined;
      return {
        data_product_id: id,
        query_id: typeof body.query_id === 'string' ? body.query_id : undefined,
        status,
        columns,
        rows,
        row_count: typeof body.row_count === 'number' ? body.row_count : rows.length,
        execution_time_ms:
          typeof body.execution_time_ms === 'number' ? body.execution_time_ms : undefined,
        error: typeof body.error === 'string' ? body.error : undefined,
        error_code: typeof body.error_code === 'string' ? body.error_code : undefined,
        tables_referenced: body.tables_referenced,
        recovery: body.recovery,
        iceberg_health_status:
          typeof body.iceberg_health_status === 'string' ? body.iceberg_health_status : undefined,
        completion_evidence: status ? 'native' : 'missing',
      };
    },

    async query(id: string, sql: string): Promise<DataProductQueryResult> {
      const receipt = await this.query_receipt(id, sql);
      if (receipt.completion_evidence !== 'native' || receipt.status !== 'completed') {
        const code =
          receipt.status === 'failed'
            ? receipt.error_code || 'query_failed'
            : 'missing_completion';
        throw new WarehouseQueryError(
          receipt.error ||
            (receipt.status
              ? `Warehouse query status is ${receipt.status}`
              : 'Warehouse query is missing completion evidence'),
          { query_id: receipt.query_id, status: receipt.status, code }
        );
      }
      const rows = receipt.rows;
      return {
        items: rows,
        metadata: {
          data_product_id: id,
          total_rows: receipt.row_count ?? rows.length,
          returned_rows: receipt.row_count ?? rows.length,
          query_time_ms: receipt.execution_time_ms,
        },
      };
    },

    async export_events(
      id: string,
      options: DataProductExportOptions = {}
    ): Promise<DataProductExportResult> {
      const instanceId = http.getDefaultHeader?.('x-loxtep-instance-id');
      if (!instanceId) {
        const err = new Error(
          'instance_required: export needs --instance or an attached project instance_id'
        );
        (err as { code?: string }).code = 'instance_required';
        throw err;
      }
      if (!options.from_beginning && !options.start) {
        const err = new Error('export requires start or from_beginning');
        (err as { code?: string }).code = 'start_required';
        throw err;
      }
      const asset = await this.get(id);
      const queueName = queueNameFromDeploymentBindings(asset);
      if (!queueName) {
        const err = new Error(
          `Data product ${id} has no deployment_bindings.queue_name; deploy the workflow first`
        );
        (err as { code?: string }).code = 'no_queue';
        throw err;
      }
      const limit = options.limit ?? 100;
      const maxPages = options.max_pages ?? 1;
      const startSent = options.from_beginning ? '0' : String(options.start);
      const events: StreamEvent[] = [];
      let start: string | undefined = startSent;
      let pages = 0;
      let truncated = false;
      let truncation: DataProductExportResult['truncation'] = null;
      let serverCursor: string | null = null;
      let nextStart: string | null = null;
      let nextStartSemantics =
        'The trace API does not document a next cursor. This page did not fill the requested limit.';

      while (pages < maxPages && events.length < limit && start !== undefined) {
        pages += 1;
        const qs = buildQueryString({ start, end: options.end });
        const res = await http.get<Record<string, unknown>>(
          `/observe/trace/${encodeURIComponent(queueName)}/events${qs}`
        );
        const payload =
          res.data && typeof res.data === 'object' && !Array.isArray(res.data)
            ? (res.data as Record<string, unknown>)
            : res;
        const batch = Array.isArray(payload.events)
          ? (payload.events as StreamEvent[])
          : Array.isArray(res.events)
            ? (res.events as StreamEvent[])
            : [];
        const cursorRaw = payload.next ?? payload.next_start ?? payload.next_cursor ?? res.next;
        const cursor = typeof cursorRaw === 'string' && cursorRaw.length > 0 ? cursorRaw : null;
        serverCursor = cursor;
        const room = limit - events.length;
        const slice = batch.slice(0, room);
        events.push(...slice);
        if (slice.length < batch.length) {
          truncated = true;
          truncation = 'client_limit';
          nextStart = eventIdentity(slice[slice.length - 1]);
          nextStartSemantics =
            'client_limit: the server did not apply this limit. next_start is the last included event id. Trace start is inclusive, so the next page may repeat that event.';
          break;
        }
        if (events.length >= limit) {
          truncated = true;
          truncation = pages >= maxPages && cursor ? 'max_pages' : 'client_limit';
          nextStart = cursor ?? eventIdentity(events[events.length - 1]);
          nextStartSemantics = cursor
            ? 'server next cursor'
            : 'client_limit: the server did not provide a next cursor. next_start is the last included event id and may overlap if start is inclusive.';
          break;
        }
        if (!cursor) {
          nextStartSemantics =
            'The server did not provide a next cursor. This response is the page that was returned.';
          break;
        }
        if (pages >= maxPages) {
          truncated = true;
          truncation = 'max_pages';
          nextStart = cursor;
          nextStartSemantics = 'server next cursor; max_pages stopped the loop';
          break;
        }
        start = cursor;
      }

      return {
        data_product_id: id,
        instance_id: instanceId,
        queue_name: queueName,
        start_sent: startSent,
        end: options.end,
        from_beginning: Boolean(options.from_beginning),
        events,
        truncated,
        truncation,
        server_cursor: serverCursor,
        next_start: nextStart,
        next_start_semantics: nextStartSemantics,
        checkpoint_committed: false,
        read_only: true,
      };
    },

    iceberg: {
      async rebuild(id: string, body: IcebergRebuildRequest): Promise<Record<string, unknown>> {
        const res = await http.post(
          `/dataproducts/${encodeURIComponent(id)}/iceberg/rebuild`,
          body
        );
        return unwrapRecord(res);
      },
      async health(id: string): Promise<Record<string, unknown>> {
        const res = await http.get(`/dataproducts/${encodeURIComponent(id)}/iceberg/health`);
        return unwrapRecord(res);
      },
      async status(id: string): Promise<Record<string, unknown>> {
        const res = await http.get(`/dataproducts/${encodeURIComponent(id)}/iceberg`);
        return unwrapRecord(res);
      },
      async cancel(id: string): Promise<Record<string, unknown>> {
        const res = await http.post(
          `/dataproducts/${encodeURIComponent(id)}/iceberg/rebuild/cancel`,
          {}
        );
        return unwrapRecord(res);
      },
      async enable(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
        const res = await http.post(`/dataproducts/${encodeURIComponent(id)}/iceberg`, body);
        return unwrapRecord(res);
      },
      async put_config(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
        const res = await http.put(
          `/dataproducts/${encodeURIComponent(id)}/iceberg/config`,
          body
        );
        return unwrapRecord(res);
      },
      async files(id: string): Promise<Record<string, unknown>> {
        const res = await http.get(`/dataproducts/${encodeURIComponent(id)}/iceberg/files`);
        return unwrapRecord(res);
      },
      async snapshots(id: string): Promise<Record<string, unknown>> {
        const res = await http.get(`/dataproducts/${encodeURIComponent(id)}/iceberg/snapshots`);
        return unwrapRecord(res);
      },
    },

    async list_tables(id: string): Promise<DataProductListTablesResult> {
      // JWT path: warehouse tables list, filtered to this data product.
      const res = await http.get<{
        success?: true;
        data?: {
          tables?: Array<{
            name: string;
            sql_name?: string;
            data_product_id?: string;
            [key: string]: unknown;
          }>;
          count?: number;
        };
        tables?: Array<{
          name: string;
          sql_name?: string;
          data_product_id?: string;
          [key: string]: unknown;
        }>;
      }>('/dataproducts/warehouse/tables');
      const payload = (res as { data?: { tables?: unknown[] } }).data ?? res;
      const tables = (payload as { tables?: Array<Record<string, unknown>> }).tables ?? [];
      const items = tables
        .filter(t => !t.data_product_id || t.data_product_id === id)
        .map(t => ({
          name: String(t.sql_name ?? t.name ?? ''),
          schema: typeof t.medallion === 'string' ? t.medallion : undefined,
          ...t,
        }));
      return { items };
    },

    async get_queue_info(id: string): Promise<QueueMetadata> {
      if (!deps) {
        throw new Error(
          'data_products.get_queue_info requires queues API; use LoxtepClient which wires it'
        );
      }
      const asset = await this.get(id);
      const queue_name = queueNameFromDeploymentBindings(asset);
      if (!queue_name) {
        return {
          queue_name: '',
          checkpoints: [],
          readers: [],
          writers: [],
          stats: {},
        };
      }
      return deps.get_queue_metadata(queue_name);
    },

    async get_reader_checkpoint(id: string, bot_id: string): Promise<ReaderCheckpoint> {
      if (!deps) {
        throw new Error(
          'data_products.get_reader_checkpoint requires queues API; use LoxtepClient which wires it'
        );
      }
      const asset = await this.get(id);
      const queue_name = queueNameFromDeploymentBindings(asset);
      if (!queue_name) {
        throw new Error(
          `Data product ${id} has no deployment_bindings.queue_name; deploy the workflow first`
        );
      }
      return deps.get_reader_checkpoint(queue_name, bot_id);
    },

    async create(body: DataProductCreateInput): Promise<DataProduct> {
      const res = await http.post<{ success: true; data: DataProduct }>('/dataproducts', body);
      const data = (res as { data?: DataProduct }).data;
      if (!data) throw new Error('Invalid create data product response');
      return data;
    },

    /**
     * Get the data product usage map showing how source DPs feed into consumer DPs.
     * Returns nodes (each with id, kind, name, fanout) and edges (source→target with projection_spec_id).
     * Scoped to the caller's organization.
     */
    async get_usage_map(): Promise<UsageMapResponse> {
      const res = await http.get<{ success?: true; data?: UsageMapResponse; nodes?: UsageMapResponse['nodes']; edges?: UsageMapResponse['edges'] }>(
        '/dataproducts/usage-map'
      );
      const payload = (res as { data?: UsageMapResponse }).data ?? res;
      return {
        nodes: (payload as UsageMapResponse).nodes ?? [],
        edges: (payload as UsageMapResponse).edges ?? [],
      };
    },

    async *stream(id: string, options?: DataProductStreamOptions): AsyncIterable<StreamEvent> {
      let asset: DataProduct;
      try {
        asset = await this.get(id);
      } catch (err: unknown) {
        // Wrap 404s in NotFoundError for data product lookup failures
        if (err && typeof err === 'object' && 'status_code' in err && (err as { status_code: number }).status_code === 404) {
          throw new NotFoundError(
            `Data product '${id}' not found`,
            'data_product',
            id
          );
        }
        throw err;
      }
      const queue_name = queueNameFromDeploymentBindings(asset);
      if (!queue_name) {
        throw new StreamingError(
          `Data product ${id} has no deployment_bindings.queue_name (not deployed)`,
          {
            details: {
              data_product_id: id,
              hint: "Deploy the workflow ('deploy_workflow' / 'deploy_project') or run runtime-queue-reconciliation so deployment_bindings.queue_name is populated.",
            },
          }
        );
      }
      const batch_size = options?.batch_size ?? 100;
      const bot_id = options?.bot_id;
      const rsdk = deps?.rsdk ?? (await deps?.get_rsdk?.());
      if (rsdk && !bot_id) {
        throw new StreamingError(
          'data_products.stream: bot_id is required when the stream bus is configured (LoxtepClient with streams/LEO_*). Use HTTP observe only by leaving bus env unset, or pass options.bot_id.',
          {
            details: {
              data_product_id: id,
              queue_name,
              hint: 'Pass options.bot_id to stream(), or leave stream bus unconfigured to use HTTP observe.',
            },
          }
        );
      }
      if (rsdk && bot_id) {
        let readCursor: string | null | undefined =
          options?.from ?? options?.checkpoint ?? undefined;
        while (true) {
          let batch: ReadQueueBatchResult;
          try {
            batch = await readQueueBatch(
              rsdk,
              bot_id,
              queue_name,
              batch_size,
              readCursor ?? null
            );
          } catch (err: unknown) {
            // Map stream bus errors to typed SDK errors
            const msg = err instanceof Error ? err.message : String(err);
            if (/not found|does not exist|no such queue/i.test(msg)) {
              throw new NotFoundError(
                `Queue '${queue_name}' not found. Verify the queue exists in your data product`,
                'queue',
                queue_name,
                { details: { data_product_id: id, bot_id } }
              );
            }
            if (/unauthorized|forbidden|permission|access denied/i.test(msg)) {
              throw new AuthorizationError(
                `Bot '${bot_id}' does not have read permission on queue '${queue_name}'`,
                { data_product_id: id, bot_id, queue_name }
              );
            }
            throw err;
          }
          const events = batch.events;
          const batchNext = batch.next_start;
          for (const event of events) {
            yield event as StreamEvent;
          }
          if (events.length === 0) break;
          if (!batchNext || events.length < batch_size) break;
          readCursor = batchNext;
        }
        return;
      }
      let httpStart = options?.from ?? options?.checkpoint ?? undefined;
      const path = `/observe/trace/${encodeURIComponent(queue_name)}/events`;
      while (true) {
        const qs = buildQueryString({ start: httpStart, limit: batch_size });
        const res = await http.get<{ events?: StreamEvent[]; data?: { events?: StreamEvent[] } }>(
          `${path}${qs}`
        );
        const payload = (res as { data?: { events?: StreamEvent[] } }).data ?? res;
        const events =
          (payload as { events?: StreamEvent[] }).events ??
          (res as { events?: StreamEvent[] }).events ??
          [];
        for (const event of events) {
          yield event;
        }
        if (events.length < batch_size) break;
        const last = events[events.length - 1];
        httpStart =
          (last as StreamEvent).event_id ?? ((last as Record<string, unknown>).id as string);
        if (!httpStart) break;
      }
    },

    async *replay(id: string, options?: DataProductReplayOptions): AsyncIterable<StreamEvent> {
      let asset: DataProduct;
      try {
        asset = await this.get(id);
      } catch (err: unknown) {
        // Wrap 404s in NotFoundError for data product lookup failures
        if (err && typeof err === 'object' && 'status_code' in err && (err as { status_code: number }).status_code === 404) {
          throw new NotFoundError(
            `Data product '${id}' not found`,
            'data_product',
            id
          );
        }
        throw err;
      }
      const queue_name = queueNameFromDeploymentBindings(asset);
      if (!queue_name) {
        throw new StreamingError(
          `Data product ${id} has no deployment_bindings.queue_name (not deployed)`,
          {
            details: {
              data_product_id: id,
              hint: "Deploy the workflow ('deploy_workflow' / 'deploy_project') or run runtime-queue-reconciliation so deployment_bindings.queue_name is populated.",
            },
          }
        );
      }
      const limit = options?.limit ?? 1000;
      const start = options?.from_beginning
        ? '0'
        : (options?.from_eid ?? options?.from_timestamp ?? options?.checkpoint_id ?? undefined);
      const end = options?.to_eid ?? options?.to_timestamp ?? undefined;
      const path = `/observe/trace/${encodeURIComponent(queue_name)}/events`;
      const qs = buildQueryString({
        start: start ?? undefined,
        end: end ?? undefined,
        limit,
      });
      const res = await http.get<{ events?: StreamEvent[]; data?: { events?: StreamEvent[] } }>(
        `${path}${qs}`
      );
      const payload = (res as { data?: { events?: StreamEvent[] } }).data ?? res;
      const events =
        (payload as { events?: StreamEvent[] }).events ??
        (res as { events?: StreamEvent[] }).events ??
        [];
      for (const event of events) {
        yield event;
      }
    },

    /**
     * Resolve a data product by name or UUID and return a FlowWriter that writes
     * directly to the data product's queue using the deployment-resolved bot_id.
     *
     * The resolution chain: data product → deployment_bindings → stream config → RStreams SDK → FlowWriter.
     */
    async get_writer(idOrName: string, options?: DataProductWriterOptions): Promise<FlowWriter> {
      const resolver = deps?.resolver;
      if (!resolver) {
        throw new StreamingError(
          'data_products.get_writer requires DataProductResolver. Use LoxtepClient which wires it automatically.',
          { details: { hint: 'Instantiate via new LoxtepClient({ ... }) rather than calling createDataProductsApi directly.' } }
        );
      }

      const { dataProduct, streamConfig } = await resolver.resolve(idOrName);
      const botId = options?.bot_id ?? dataProduct.bot_id;
      const queueName = dataProduct.queue_name;
      const closedError = () =>
        new StreamingError(
          'Cannot write to a closed FlowWriter. Create a new writer via data_products.get_writer().',
          { details: { data_product_id: dataProduct.data_product_id, queue_name: queueName } }
        );

      // Event publish is streams-only (Kinesis via stream config / BusWriter STS).
      // There is no HTTP observe-proxy write path — configure LEO_* / instance
      // stream environment in the account that owns the bus (including self-hosted).
      const streamResources = resolveStreamsConfiguration(streamConfig);
      if (!streamResources) {
        throw new StreamingError(
          `Failed to resolve stream bus configuration for data product '${dataProduct.name}'. Stream config is incomplete.`,
          {
            details: {
              data_product_id: dataProduct.data_product_id,
              instance_id: dataProduct.instance_id,
              hint:
                'Configure instance stream bus credentials (LEO_* / streams config) in the AWS account that owns the bus. HTTP queue publish is not supported.',
            },
          }
        );
      }
      // Prefer the client-wired SDK (login STS → BusWriter). Never invent a bare
      // leo-sdk with the default AWS profile — that fails on shared/org buses.
      const rsdk =
        deps?.rsdk ??
        (await deps?.get_rsdk?.()) ??
        createRStreamsSdk(streamResources);
      if (!rsdk) {
        throw new StreamingError(
          `Failed to resolve stream runtime for data product '${dataProduct.name}'.`,
          {
            details: {
              data_product_id: dataProduct.data_product_id,
              hint: 'Run `loxtep login` so STS BusWriter credentials are available, then retry.',
            },
          }
        );
      }

      // The rstreams `load` stream (inside createQueueWriter) owns buffering, batching, backoff,
      // and checkpointing — the wrapper just forwards business objects to it.
      return createQueueWriter(rsdk, botId, queueName, closedError);
    },

    /**
     * Resolve a data product by name or UUID and return an AsyncIterable that reads
     * events from the data product's queue.
     *
     * The resolution chain: data product → deployment_bindings → stream config → RStreams SDK → reader.
     */
    async get_reader(idOrName: string, options?: DataProductReaderOptions): Promise<AsyncIterable<StreamEvent>> {
      const resolver = deps?.resolver;
      if (!resolver) {
        throw new StreamingError(
          'data_products.get_reader requires DataProductResolver. Use LoxtepClient which wires it automatically.',
          { details: { hint: 'Instantiate via new LoxtepClient({ ... }) rather than calling createDataProductsApi directly.' } }
        );
      }

      const { dataProduct, streamConfig } = await resolver.resolve(idOrName);
      const streamResources = resolveStreamsConfiguration(streamConfig);
      if (!streamResources) {
        throw new StreamingError(
          `Failed to resolve stream bus configuration for data product '${dataProduct.name}'. Stream config is incomplete.`,
          {
            details: {
              data_product_id: dataProduct.data_product_id,
              instance_id: dataProduct.instance_id,
              hint: 'Verify the instance has a fully provisioned stream bus.',
            },
          }
        );
      }
      const rsdk =
        deps?.rsdk ??
        (await deps?.get_rsdk?.()) ??
        createRStreamsSdk(streamResources);
      if (!rsdk) {
        throw new StreamingError(
          `Failed to resolve stream runtime for data product '${dataProduct.name}'.`,
          {
            details: {
              data_product_id: dataProduct.data_product_id,
              hint: 'Run `loxtep login` so STS BusWriter credentials are available, then retry.',
            },
          }
        );
      }
      const botId = options?.bot_id ?? `sdk-reader-${dataProduct.name}`;
      const queueName = dataProduct.queue_name;
      const batchSize = options?.batch_size ?? 100;
      const startFrom = options?.from ?? undefined;

      async function* readEvents(): AsyncIterable<StreamEvent> {
        let readCursor: string | null | undefined = startFrom;
        while (true) {
          let batch: ReadQueueBatchResult;
          try {
            batch = await readQueueBatch(rsdk, botId, queueName, batchSize, readCursor ?? null);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/not found|does not exist|no such queue/i.test(msg)) {
              throw new NotFoundError(
                `Queue '${queueName}' not found. Verify the data product has been deployed and the queue exists.`,
                'queue',
                queueName,
                { details: { data_product_id: dataProduct.data_product_id, bot_id: botId } }
              );
            }
            if (/unauthorized|forbidden|permission|access denied/i.test(msg)) {
              throw new AuthorizationError(
                `Bot '${botId}' does not have read permission on queue '${queueName}'`,
                { data_product_id: dataProduct.data_product_id, bot_id: botId, queue_name: queueName }
              );
            }
            throw err;
          }
          const events = batch.events;
          const batchNext = batch.next_start;
          for (const event of events) {
            yield event as StreamEvent;
          }
          if (events.length === 0) break;
          if (!batchNext || events.length < batchSize) break;
          readCursor = batchNext;
        }
      }

      return readEvents();
    },

    /**
     * Invalidate cached data product resolutions. If no argument is provided,
     * clears all cached entries. If a specific name or ID is provided, removes only that entry.
     */
    invalidate_cache(idOrName?: string): void {
      const resolver = deps?.resolver;
      if (!resolver) return;
      resolver.invalidate(idOrName);
    },

    /**
     * Check promotion readiness for a data product.
     * Returns prerequisite checklist, progress percentage, and promotability.
     */
    async readiness(data_product_id: string): Promise<DataProductPromotionReadiness> {
      const res = await http.get<{ success: true; data: DataProductPromotionReadiness }>(
        `/graph/promotions/${encodeURIComponent(data_product_id)}/readiness`
      );
      return res.data;
    },

    /**
     * Execute a medallion tier promotion (Bronze→Silver or Silver→Gold).
     * Prerequisites are validated server-side. Returns 422 if not satisfied.
     */
    async promote(
      data_product_id: string,
      target_tier: 'silver' | 'gold'
    ): Promise<DataProductPromotionResult> {
      const res = await http.post<{ success: true; data: DataProductPromotionResult }>(
        `/graph/promotions/${encodeURIComponent(data_product_id)}/promote`,
        { target_tier }
      );
      return res.data;
    },

    semantic_inference: {
      async request(id: string): Promise<unknown> {
        if (!id) throw new Error('id is required');
        const res = await http.post(semanticInferencePath(id), {});
        return unwrapData(res);
      },
      async get(id: string): Promise<unknown> {
        if (!id) throw new Error('id is required');
        const res = await http.get(semanticInferencePath(id));
        return unwrapData(res);
      },
      async promote(id: string, body: SemanticInferencePromoteInput): Promise<unknown> {
        if (!id) throw new Error('id is required');
        const payload: Record<string, unknown> = {
          run_id: body.run_id,
          action: body.action,
        };
        if (body.issue_id !== undefined) payload.issue_id = body.issue_id;
        const res = await http.post(`${semanticInferencePath(id)}/promote`, payload);
        return unwrapData(res);
      },
    },
  };
}
