/**
 * Promises API types (customer term for data contracts). Backend: /dataproducts/datacontracts.
 * snake_case per backend conventions.
 */

/** Data contract / Promise (dataproducts microservice). */
export interface Promise_ {
  contract_id: string;
  data_product_id: string;
  name: string;
  description?: string;
  version: string;
  status: string;
  schema_ref?: {
    schema_version_id: string;
    version: string;
    format: string;
  };
  guarantees: Record<string, unknown>;
  sla_definitions: unknown[];
  sla: Record<string, unknown>;
  terms?: Record<string, unknown>;
  effective_from?: string;
  effective_until?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  metadata?: Record<string, unknown>;
}

/** List response shape (successResponse with pagination). */
export interface PromisesListResponse {
  success: true;
  data: {
    items: Promise_[];
    pagination: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
  };
}

/** List filters (query params). */
export interface PromisesListFilters {
  page?: number;
  page_size?: number;
  data_product_id?: string;
  status?: string;
  search?: string;
  sort_by?: 'name' | 'version' | 'created_at' | 'updated_at' | 'effective_date';
  sort_order?: 'asc' | 'desc';
}
