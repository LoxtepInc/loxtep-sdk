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
  DataProductListTablesResult,
  DataProductLexicon,
  DataProductCreateInput,
  UsageMapResponse,
} from './data-products-types.js';
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
  list_tables: (id: string) => Promise<DataProductListTablesResult>;
  get_queue_info: (id: string) => Promise<QueueMetadata>;
  get_reader_checkpoint: (id: string, bot_id: string) => Promise<ReaderCheckpoint>;
  create: (body: DataProductCreateInput) => Promise<DataProduct>;
  getUsageMap: () => Promise<UsageMapResponse>;
  stream: (id: string, options?: DataProductStreamOptions) => AsyncIterable<StreamEvent>;
  replay: (id: string, options?: DataProductReplayOptions) => AsyncIterable<StreamEvent>;
  get_writer: (idOrName: string, options?: DataProductWriterOptions) => Promise<FlowWriter>;
  get_reader: (idOrName: string, options?: DataProductReaderOptions) => Promise<AsyncIterable<StreamEvent>>;
  invalidate_cache: (idOrName?: string) => void;
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

    async query(id: string, sql: string): Promise<DataProductQueryResult> {
      const res = await http.post<{ success: true; data: DataProductQueryResult }>(
        '/dataproducts/query',
        { data_product_id: id, sql }
      );
      const payload = (res as { data?: DataProductQueryResult }).data;
      if (!payload) {
        return { items: [], metadata: { data_product_id: id } };
      }
      return payload;
    },

    async list_tables(id: string): Promise<DataProductListTablesResult> {
      const res = await http.get<{ success: true; data: DataProductListTablesResult }>(
        `/dataproducts/${encodeURIComponent(id)}/tables`
      );
      const payload = (res as { data?: DataProductListTablesResult }).data;
      if (!payload) {
        return { items: [] };
      }
      return payload;
    },

    async get_queue_info(id: string): Promise<QueueMetadata> {
      if (!deps) {
        throw new Error(
          'data_products.get_queue_info requires queues API; use LoxtepClient which wires it'
        );
      }
      const asset = await this.get(id);
      const queue_name = (asset.storage as { rstreams_queue?: string } | undefined)?.rstreams_queue;
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
      const queue_name = (asset.storage as { rstreams_queue?: string } | undefined)?.rstreams_queue;
      if (!queue_name) {
        throw new Error(`Data product ${id} has no stream queue in storage (not configured)`);
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
    async getUsageMap(): Promise<UsageMapResponse> {
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
      const queue_name = (asset.storage as { rstreams_queue?: string } | undefined)?.rstreams_queue;
      if (!queue_name) {
        throw new StreamingError(
          `Data product ${id} has no stream queue in storage (not configured)`,
          {
            details: {
              data_product_id: id,
              hint: 'Verify the data product has a configured stream queue in its storage settings.',
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
      const queue_name = (asset.storage as { rstreams_queue?: string } | undefined)?.rstreams_queue;
      if (!queue_name) {
        throw new StreamingError(
          `Data product ${id} has no stream queue in storage (not configured)`,
          {
            details: {
              data_product_id: id,
              hint: 'Verify the data product has a configured stream queue in its storage settings.',
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
      const rsdk = createRStreamsSdk(streamResources);
      const botId = options?.bot_id ?? dataProduct.bot_id;
      const queueName = dataProduct.queue_name;

      // The rstreams `load` stream (inside createQueueWriter) owns buffering, batching, backoff,
      // and checkpointing — the wrapper just forwards business objects to it.
      return createQueueWriter(
        rsdk,
        botId,
        queueName,
        () =>
          new StreamingError(
            'Cannot write to a closed FlowWriter. Create a new writer via data_products.get_writer().',
            { details: { data_product_id: dataProduct.data_product_id, queue_name: queueName } }
          )
      );
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
      const rsdk = createRStreamsSdk(streamResources);
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
    async readiness(data_product_id: string): Promise<{
      current_tier: string;
      target_tier: string;
      prerequisites: Array<{ id: string; name: string; satisfied: boolean; remediation?: string }>;
      progress_pct: number;
      promotable: boolean;
    }> {
      const res = await http.get<{ success: true; data: any }>(
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
    ): Promise<{
      success: boolean;
      new_tier?: string;
      entity_iris?: string[];
      diagnostics?: Array<{ id: string; name: string; satisfied: boolean; remediation?: string }>;
      error?: string;
    }> {
      const res = await http.post<{ success: true; data: any }>(
        `/graph/promotions/${encodeURIComponent(data_product_id)}/promote`,
        { target_tier }
      );
      return res.data;
    },
  };
}
