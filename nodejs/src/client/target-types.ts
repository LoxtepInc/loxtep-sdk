/**
 * Target API types — delivery-side connector bindings (workflow connection nodes).
 * Parallel to trigger-types.ts. Backend: project entities connections.
 */

/** Pagination metadata from list APIs. */
export interface TargetPaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Single target (delivery-side connection / connector binding). */
export interface Target {
  connection_id: string;
  organization_id?: string | null;
  project_id?: string | null;
  workflow_id?: string | null;
  connector_id?: string | null;
  connector_type?: string | null;
  key?: string;
  name: string;
  type: string;
  status: string;
  direction?: 'inbound' | 'outbound' | 'bidirectional' | string;
  data?: string;
  configuration: Record<string, unknown>;
  metadata: Record<string, unknown>;
  verified?: boolean;
  draft?: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  [key: string]: unknown;
}

/** Input for targets.create(). */
export interface TargetCreateInput {
  /** Required — connections live under a project workspace. */
  project_id: string;
  /** Required — connection nodes are workflow-scoped. */
  workflow_id: string;
  key?: string;
  name: string;
  type: string;
  connector_id?: string;
  connector_type?: string;
  direction?: 'inbound' | 'outbound' | 'bidirectional' | string;
  status?: string;
  data?: string;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  verified?: boolean;
  draft?: boolean;
}

/** Input for targets.update(). */
export interface TargetUpdateInput {
  project_id?: string;
  workflow_id?: string;
  key?: string;
  name?: string;
  type?: string;
  connector_id?: string;
  status?: string;
  direction?: string;
  data?: string;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  verified?: boolean;
  draft?: boolean;
}

/** Filters for targets.list(). */
export interface TargetsListFilters {
  page?: number;
  page_size?: number;
  search?: string;
  type?: string | string[];
  status?: string | string[];
  project_id?: string;
  workflow_id?: string;
  /** Prefer outbound for delivery targets. */
  direction?: string;
}

export interface TargetsListResponse {
  success: true;
  data: {
    items: Target[];
    pagination: TargetPaginationMeta;
  };
}

export interface TargetTestResult {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}

/** @deprecated Use TargetsListFilters */
export type TargetsListParams = TargetsListFilters;

/** @deprecated Old consumptions-era discriminator — no longer used. */
export type TargetType =
  | 'webhook'
  | 'api_endpoint'
  | 'export'
  | 'database_sync'
  | 'bi_connect'
  | 'event_stream';
