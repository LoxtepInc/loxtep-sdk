/**
 * Flow (backend: workflow) API types. snake_case per backend conventions.
 * Backend: workflows microservice /workflows/workflows, /workflows/workflows/:id/nodes.
 */

/** Pagination metadata from list APIs. */
export interface FlowPaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Single flow (backend: workflow). */
export interface Flow {
  workflow_id: string;
  project_id: string;
  name: string;
  connection_id?: string;
  template_id?: string;
  configuration: Record<string, unknown>;
  deployment: Record<string, unknown>;
  status: 'active' | 'paused' | 'error' | 'inactive';
  metrics: Record<string, unknown>;
  node_count?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  [key: string]: unknown;
}

/** Flow with nodes (from get). */
export interface FlowWithNodes extends Flow {
  nodes: FlowNode[];
}

/** Single node in a flow. */
export interface FlowNode {
  node_id: string;
  workflow_id: string;
  name: string;
  type: 'ingestion' | 'transformation' | 'export';
  node_subtype?: string;
  webhook_id?: string;
  configuration?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  [key: string]: unknown;
}

/** Filters for flows.list(). project_id required. */
export interface FlowsListFilters {
  project_id: string;
  status?: 'active' | 'paused' | 'error' | 'inactive';
  search?: string;
  page?: number;
  page_size?: number;
}

/** Response from flows.list() — API returns { success, data: { items, pagination } }. */
export interface FlowsListResponse {
  success: true;
  data: {
    items: Flow[];
    pagination: FlowPaginationMeta;
  };
}

/** Input for flows.create(). */
export interface FlowCreateInput {
  project_id: string;
  name: string;
  description?: string;
  connection_id?: string;
  template_id?: string;
  configuration?: Record<string, unknown>;
}

/** Options for get_writer. Optional definition (schema) validation. */
export interface GetWriterOptions {
  /**
   * Bot identity for stream puts (source id). **Required** when `close()` flushes to the bus
   * (configured `streams` / `RStreamsSdk`).
   */
  bot_id?: string;
  /**
   * Destination runtime queue name. If omitted, SDK can derive from flow nodes when
   * `environment_prefix` and `project_id` are set (pattern: `{prefix}-workflow-{id}-ingestion-{node_id}`).
   */
  output_queue_name?: string;
  /**
   * e.g. `DEV`, `APP` — used with flow GET to synthesize ingestion queue name when `output_queue_name` is omitted.
   */
  environment_prefix?: string;
  /** Project ID — used with `environment_prefix` to load the flow and resolve the ingestion queue. */
  project_id?: string;
  /** If true, validate each event against the data product definition (schema). */
  validate_definition?: boolean;
  /** Definition version to validate against (e.g. when fetching from API). */
  definition_version?: string;
  /** How to handle validation errors: reject (throw), warn (log), skip (drop event). */
  on_validation_error?: 'reject' | 'warn' | 'skip';
  /** Optional JSON Schema (or partial) to validate events. If absent, validation is no-op unless definition is fetched elsewhere. */
  definition?: Record<string, unknown>;
  /** Maximum number of events per batch when flushing to the stream bus. Default: 100. */
  batch_size?: number;
  /** Interval in milliseconds between automatic flushes. Default: 5000. */
  flush_interval_ms?: number;
  /** Maximum number of retry attempts for transient write failures. Default: 3. */
  max_retries?: number;
}

/** Writer interface: write(event), close() flushes. Transparent batching. */
export interface FlowWriter {
  write: (event: unknown) => void | Promise<void>;
  close: () => Promise<void>;
}
