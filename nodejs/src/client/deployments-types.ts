/**
 * Deployments list types (workflows microservice GET /deployments).
 * snake_case per backend conventions.
 */

export interface Deployment {
  deployment_id: string;
  project_id: string;
  instance_id: string;
  name: string;
  type?: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface DeploymentsListFilters {
  project_id?: string;
  instance_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
  sort_by?: 'created_at' | 'updated_at' | 'name';
  sort_order?: 'asc' | 'desc';
}

export interface DeploymentsListResponse {
  success: true;
  data: {
    items: Deployment[];
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
