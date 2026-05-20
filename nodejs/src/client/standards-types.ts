/**
 * Standards API types (customer term for data standards). Backend: /governance/standards.
 * snake_case per backend conventions.
 */

/** Data standard (governance microservice). */
export interface Standard {
  standard_id: string;
  organization_id: string;
  domain_id: string | null;
  name: string;
  description: string;
  type: string;
  threshold: number;
  unit: string;
  applies_to: string[];
  status: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** List response shape (successResponse with pagination). */
export interface StandardsListResponse {
  success: true;
  data: {
    items: Standard[];
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
export interface StandardsListFilters {
  page?: number;
  page_size?: number;
  domain_id?: string | null;
  status?: 'active' | 'draft' | 'deprecated';
  type?: 'freshness' | 'completeness' | 'accuracy' | 'consistency' | 'uniqueness';
}
