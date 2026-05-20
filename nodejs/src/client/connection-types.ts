/**
 * Connection API types. snake_case per backend conventions.
 * Backend: workflows microservice GET/POST /workflows/connections, etc.
 */

/** Pagination metadata from list APIs. */
export interface ConnectionPaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Connection type enum (backend ConnectionTypes). */
export const CONNECTION_TYPES = {
  DATABASE: 'database',
  API: 'api',
  WEBHOOK: 'webhook',
  FILE: 'file',
} as const;

/** Connection status enum (backend ConnectionStatuses). */
export const CONNECTION_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERROR: 'error',
} as const;

/** Single connection. */
export interface Connection {
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

/** Input for connections.create(). */
export interface ConnectionCreateInput {
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

/** Input for connections.update(). */
export interface ConnectionUpdateInput {
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

/** Filters for connections.list(). */
export interface ConnectionsListFilters {
  page?: number;
  page_size?: number;
  search?: string;
  type?: string | string[];
  status?: string | string[];
  verified?: boolean;
  draft?: boolean;
}

/** Response from connections.list() — API returns { success, data: { items, pagination } }. */
export interface ConnectionsListResponse {
  success: true;
  data: {
    items: Connection[];
    pagination: ConnectionPaginationMeta;
  };
}

/** Result from connections.test(). */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  tested_at?: string;
  [key: string]: unknown;
}
