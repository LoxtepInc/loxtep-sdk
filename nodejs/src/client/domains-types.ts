/**
 * Domains API types. Backend: GET /organizations/domains, GET /organizations/domains/:domain_id.
 * snake_case per backend conventions.
 */

/** Domain (organizations microservice). */
export interface Domain {
  domain_id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  owner_user_id?: string | null;
  instance_id?: string | null;
  domain_type?: string | null;
  status?: string | null;
  visibility?: string | null;
  is_council: boolean;
  parent_domain_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

/** List response shape (successResponse with pagination). */
export interface DomainsListResponse {
  success: true;
  data: {
    items: Domain[];
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
export interface DomainsListFilters {
  organization_id?: string;
  page?: number;
  page_size?: number;
  status?: 'active' | 'inactive' | 'pending';
  search?: string;
}
