/**
 * Data product (backend: data product) API types. All snake_case per backend conventions.
 */

/** Discriminator chosen at creation time. Drives section routing and chrome. */
export type DataProductKind = 'source' | 'consumer';

/** Pagination metadata from list APIs. */
export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Filters for data_products.list(). Maps to GET /dataproducts query params. */
export interface DataProductsListFilters {
  page?: number;
  page_size?: number;
  domain_id?: string;
  status?: 'draft' | 'active' | 'deprecated' | 'archived';
  kind?: DataProductKind;
  classification?: string;
  owner_user_id?: string;
  search?: string;
  tags?: string[];
  sort_by?: 'name' | 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
}

/** Single data product (backend: data product). Simplified for SDK; full shape matches API. */
export interface DataProduct {
  data_product_id: string;
  organization_id: string;
  domain_id: string;
  project_id?: string;
  name: string;
  description: string;
  kind: DataProductKind;
  status: string;
  owner: { user_id: string; team?: string };
  schema?: Record<string, unknown>;
  ingestion?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  consumption?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  quality?: Record<string, unknown>;
  lineage?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  deployment_bindings?: {
    instance_id: string;
    deployment_id: string;
    bot_id: string;
    queue_name: string;
    microservice_id: string;
  };
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  created_by?: string;
  updated_by?: string;
  [key: string]: unknown;
}

/** Response from data_products.get() — API returns { success: true, data: DataProduct }. */
export interface DataProductGetResponse {
  success: true;
  data: DataProduct;
}

/** Response from data_products.list() — API returns { success: true, data: { items, pagination } }. */
export interface DataProductsListResponse {
  success: true;
  data: {
    items: DataProduct[];
    pagination: PaginationMeta;
  };
}

/** Options for data_products.get() — optional query params. */
export interface DataProductGetOptions {
  include_schema?: boolean;
  include_quality?: boolean;
  include_lineage?: boolean;
  include_contracts?: boolean;
}

/** Glossary term value (definition and optional SKOS-style relations). */
export interface GlossaryTermValue {
  definition: string;
  alt_labels?: string[];
  broader?: string[];
  narrower?: string[];
  related?: string[];
}

/** Lexicon response from data_products.get_lexicon(id). */
export interface DataProductLexicon {
  glossary_terms: Record<string, GlossaryTermValue>;
  field_glossary_map?: Record<string, string[]>;
}

/** Search result item (catalog/search API). */
export interface SearchResultItem {
  id: string;
  type: 'data_product' | 'project' | 'domain';
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/** Response from data_products.search() — catalog search API. */
export interface DataProductsSearchResponse {
  success?: boolean;
  results: SearchResultItem[];
  totalCount: number;
  facets?: Record<string, unknown>;
}

/** Options for data_products.stream() — live read from queue. */
export interface DataProductStreamOptions {
  from?: string;
  batch_size?: number;
  checkpoint?: string;
  /**
   * **Required** when a stream bus is configured: consumer identity for `offloadEvents` on that queue.
   * If the bus is not configured, `stream()` uses HTTP observe and `bot_id` is ignored.
   */
  bot_id?: string;
}

/** Options for data_products.replay() — time-travel read. */
export interface DataProductReplayOptions {
  from_eid?: string;
  to_eid?: string;
  from_timestamp?: string;
  to_timestamp?: string;
  from_beginning?: boolean;
  from_latest?: boolean;
  checkpoint_id?: string;
  auto_checkpoint?: boolean;
  limit?: number;
}

/** Single event from stream/replay. */
export interface StreamEvent {
  event_id?: string;
  payload?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

/** Body for data_products.create() — POST /dataproducts (legacy or ODPS path per API). */
export interface DataProductCreateInput {
  name?: string;
  description?: string;
  kind: DataProductKind;
  domain_id?: string;
  owner_user_id?: string;
  owner_team?: string;
  classification?: string;
  tags?: string[];
  /** @remarks Platform API field for the bound queue name. */
  rstreams_queue?: string;
  s3_location?: string;
  retention_period_days?: number;
  odps_document?: { product: Record<string, unknown> };
  connector_type?: string;
  sync_entity?: string;
  [key: string]: unknown;
}

/** Result of data_products.query(id, sql). Backend: POST /dataproducts/query or analytics query. */
export interface DataProductQueryResult {
  items: Record<string, unknown>[];
  metadata: {
    data_product_id: string;
    data_product_name?: string;
    total_rows?: number;
    returned_rows?: number;
    limit?: number;
    offset?: number;
    query_time_ms?: number;
  };
}

/** Single table info from data_products.list_tables(id). */
export interface DataProductTableInfo {
  name: string;
  schema?: string;
  [key: string]: unknown;
}

/** Result of data_products.list_tables(id). Backend: GET /dataproducts/:id/tables. */
export interface DataProductListTablesResult {
  items: DataProductTableInfo[];
}

/** A node in the data product usage map (source→consumer graph). */
export interface UsageMapNode {
  id: string;
  kind: DataProductKind;
  name: string;
  /** Number of distinct consumer DPs this source feeds (0 for consumer nodes). */
  fanout: number;
}

/** A directed edge in the data product usage map (source→consumer). */
export interface UsageMapEdge {
  source: string;
  target: string;
  projection_spec_id: string;
}

/** Response from data_products.getUsageMap(). */
export interface UsageMapResponse {
  nodes: UsageMapNode[];
  edges: UsageMapEdge[];
}
