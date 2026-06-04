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
  /** Branch from the API response (mapped from db `github_repo_branch`). */
  github_branch?: string;
  /** SHA of the last successfully synced commit (null/undefined when never synced). */
  github_last_commit_sha?: string | null;
  /** UTC timestamp of the last successful sync (null/undefined when never synced). */
  github_last_sync_at?: string | null;
  customer_role_arn?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Repository binding projection returned by `client.projects.repository(projectId)`.
 * Read-only accessor (synchronous read, R18.6 carve-out).
 * Returns the five binding fields plus last-synced state from the project record.
 */
export interface RepositoryBinding {
  /** GitHub repository URL (e.g. "https://github.com/org/repo"). */
  url: string | null;
  /** Repository name (e.g. "org/repo"). */
  name: string | null;
  /** Subpath within the repository (empty string when the whole repo is the bundle). */
  subpath: string;
  /** Branch (defaults to "main" on the platform). */
  branch: string;
  /** SHA of the last successfully synced commit (empty string when never synced). */
  last_commit_sha: string;
  /** UTC timestamp of the last successful sync (empty string when never synced). */
  last_sync_at: string;
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
