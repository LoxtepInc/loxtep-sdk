/**
 * Projects API types. Canonical API: GET/POST /workflows/projects, GET/PUT/DELETE /workflows/projects/:project_id.
 * snake_case per backend conventions.
 */

/** Project (workflows microservice projects API shape). */
export interface Project {
  project_id: string;
  organization_id: string;
  domain_id?: string | null;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'archived';
  metadata?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  s3_bucket_name?: string;
  repository_url?: string;
  repository_branch?: string;
  github_repo_url?: string;
  github_repo_name?: string;
  github_repo_path?: string;
  customer_role_arn?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** List projects response. */
export interface ProjectsListResponse {
  success: true;
  data: {
    items: Project[];
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
export interface ProjectsListFilters {
  status?: 'active' | 'inactive' | 'archived';
  search?: string;
  page?: number;
  page_size?: number;
}

/** Create project body (POST /workflows/projects). */
export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  metadata?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  template_slug?: string;
  domain_id?: string;
  github_action?: 'create_new' | 'import_existing' | 'none';
  github_repo_name?: string;
  github_import_url?: string;
  repository_branch?: string;
  github_branch?: string;
  [key: string]: unknown;
}

/** Update project body (PUT /workflows/projects/:id). */
export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  metadata?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  repository_url?: string;
  repository_branch?: string;
  github_repo_url?: string;
  github_repo_name?: string;
  github_repo_path?: string;
  customer_role_arn?: string;
  [key: string]: unknown;
}
