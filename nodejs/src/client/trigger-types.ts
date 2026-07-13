/**
 * Trigger API types (ingest-side source bindings). snake_case per backend conventions.
 * Backend: workflows microservice GET/POST /workflows/connections, etc.
 * ("connections" is the backend term; the SDK surface names these `triggers`.)
 */

/** Pagination metadata from list APIs. */
export interface TriggerPaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Trigger type enum (backend ConnectionTypes). */
export const TRIGGER_TYPES = {
  DATABASE: 'database',
  API: 'api',
  WEBHOOK: 'webhook',
  FILE: 'file',
} as const;

/** Trigger status enum (backend ConnectionStatuses). */
export const TRIGGER_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERROR: 'error',
} as const;

/** Single trigger (ingest source binding). */
export interface Trigger {
  connection_id: string;
  organization_id?: string | null;
  key: string;
  name: string;
  type: string;
  status: string;
  data: string;
  configuration: Record<string, unknown>;
  metadata: Record<string, unknown>;
  verified: boolean;
  draft: boolean;
  last_tested?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  [key: string]: unknown;
}

/** Input for triggers.create(). */
export interface TriggerCreateInput {
  key: string;
  name: string;
  type: string;
  status?: string;
  data?: string;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  verified?: boolean;
  draft?: boolean;
}

/** Input for triggers.update(). */
export interface TriggerUpdateInput {
  key?: string;
  name?: string;
  type?: string;
  status?: string;
  data?: string;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  verified?: boolean;
  draft?: boolean;
}

/** Filters for triggers.list(). */
export interface TriggersListFilters {
  page?: number;
  page_size?: number;
  search?: string;
  type?: string | string[];
  status?: string | string[];
  verified?: boolean;
  draft?: boolean;
}

/** Response from triggers.list() — API returns { success, data: { items, pagination } }. */
export interface TriggersListResponse {
  success: true;
  data: {
    items: Trigger[];
    pagination: TriggerPaginationMeta;
  };
}

/** Result from triggers.test(). */
export interface TriggerTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  tested_at?: string;
  [key: string]: unknown;
}
