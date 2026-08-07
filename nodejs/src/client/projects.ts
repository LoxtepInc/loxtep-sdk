/**
 * Projects API: list, get, create, update, delete.
 * Canonical API: GET/POST /workflows/projects, GET/PUT/DELETE /workflows/projects/:project_id.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Project,
  ProjectsListResponse,
  ProjectsListFilters,
  CreateProjectInput,
  UpdateProjectInput,
  RepositoryBinding,
} from './projects-types.js';
import type { ApplyTemplateInput, ApplyTemplateResult } from './templates-types.js';

const PROJECTS_BASE = '/workflows/projects';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Response from POST /workflows/projects/:id/export (unbound workspace download). */
export interface ProjectWorkspaceExportResult {
  project_id: string;
  organization_id: string;
  uses_streaming: boolean;
  total_size_bytes: number;
  export_data?: {
    metadata?: Record<string, unknown>;
    entity_counts?: Record<string, number>;
    entities: Array<{
      entity_type: string;
      entity_id: string;
      data: Record<string, unknown>;
      import_order?: number;
    }>;
    total_size_bytes?: number;
  };
  presigned_url?: string;
  s3_key?: string;
  expires_at?: string;
}

export interface GitHubPullResult {
  success: boolean;
  commit_sha?: string;
  validation_passed?: boolean;
  file_count?: number;
  errors?: string[];
  message?: string;
}

export interface GitHubPushResult {
  success: boolean;
  commit_sha?: string;
  commit_url?: string;
  file_count?: number;
  errors?: string[];
  message?: string;
}

export function createProjectsApi(http: LoxtepHttpClient): {
  list: (filters?: ProjectsListFilters) => Promise<ProjectsListResponse['data']>;
  get: (project_id: string) => Promise<Project>;
  create: (body: CreateProjectInput) => Promise<Project>;
  update: (project_id: string, body: UpdateProjectInput) => Promise<Project>;
  delete: (project_id: string) => Promise<{ project_id: string; deleted: boolean }>;
  apply_template: (project_id: string, body: ApplyTemplateInput) => Promise<ApplyTemplateResult>;
  repository: (project_id: string) => Promise<RepositoryBinding>;
  /** POST /workflows/projects/:id/reindex — refresh customer_workspace_entity_index. */
  reindex: (project_id: string) => Promise<unknown>;
  /** POST /workflows/projects/:id/export — S3 workspace export for unbound clone. */
  export_workspace: (
    project_id: string,
    body?: {
      subscription_tier?: 'free' | 'starter' | 'pro' | 'enterprise';
      include_drafts?: boolean;
      include_versions?: boolean;
      validate_size?: boolean;
    }
  ) => Promise<ProjectWorkspaceExportResult>;
  /** POST /workflows/projects/:id/github/pull — Cloud S3 ← GitHub (bound only). */
  github_pull: (project_id: string, body?: { commit_sha?: string }) => Promise<GitHubPullResult>;
  /** POST /workflows/projects/:id/github/push — Cloud S3 → GitHub (bound only). */
  github_push: (
    project_id: string,
    body?: { commit_message?: string; branch?: string }
  ) => Promise<GitHubPushResult>;
} {
  return {
    async list(filters?: ProjectsListFilters): Promise<ProjectsListResponse['data']> {
      const params: Record<string, string | number | undefined> = {
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 100,
      };
      if (filters?.status) params.status = filters.status;
      if (filters?.search) params.search = filters.search;
      const qs = buildQueryString(params);
      const res = await http.get<ProjectsListResponse>(`${PROJECTS_BASE}${qs}`);
      return res.data;
    },

    async get(project_id: string): Promise<Project> {
      const res = await http.get<{ success: true; data: Project }>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}`
      );
      return res.data;
    },

    async create(body: CreateProjectInput): Promise<Project> {
      const res = await http.post<{ success: true; data: Project }>(PROJECTS_BASE, body);
      return res.data;
    },

    async update(project_id: string, body: UpdateProjectInput): Promise<Project> {
      const res = await http.put<{ success: true; data: Project }>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}`,
        body
      );
      return res.data;
    },

    async delete(project_id: string): Promise<{ project_id: string; deleted: boolean }> {
      const res = await http.delete<{
        success: true;
        data: { project_id: string; deleted: boolean };
      }>(`${PROJECTS_BASE}/${encodeURIComponent(project_id)}`);
      return res.data;
    },

    async apply_template(
      project_id: string,
      body: ApplyTemplateInput
    ): Promise<ApplyTemplateResult> {
      const res = await http.post<{ success: true; data: ApplyTemplateResult }>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}/templates`,
        body
      );
      return res.data;
    },

    /**
     * Read-only accessor returning the project's repository binding and last-synced state.
     * Synchronous read (R18.6 carve-out). Returns empty strings for last_commit_sha
     * and last_sync_at when no sync has ever completed (R17.12).
     */
    async repository(project_id: string): Promise<RepositoryBinding> {
      const res = await http.get<{ success: true; data: Project }>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}`
      );
      const project = res.data;
      return {
        url: project.github_repo_url ?? null,
        name: project.github_repo_name ?? null,
        subpath: project.github_repo_path ?? '',
        branch: project.github_branch ?? 'main',
        last_commit_sha: project.github_last_commit_sha ?? '',
        last_sync_at: project.github_last_sync_at ?? '',
      };
    },

    async reindex(project_id: string): Promise<unknown> {
      const res = await http.post<{ success: true; data?: unknown }>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}/reindex`,
        {}
      );
      return res.data ?? res;
    },

    async export_workspace(
      project_id: string,
      body?: {
        subscription_tier?: 'free' | 'starter' | 'pro' | 'enterprise';
        include_drafts?: boolean;
        include_versions?: boolean;
        validate_size?: boolean;
      }
    ): Promise<ProjectWorkspaceExportResult> {
      const res = await http.post<{ success: true; data: ProjectWorkspaceExportResult }>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}/export`,
        body ?? {}
      );
      return res.data;
    },

    async github_pull(
      project_id: string,
      body?: { commit_sha?: string }
    ): Promise<GitHubPullResult> {
      const res = await http.post<{ success: true; data?: GitHubPullResult } | GitHubPullResult>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}/github/pull`,
        body ?? {}
      );
      if (res && typeof res === 'object' && 'data' in res && res.data) {
        return res.data;
      }
      return res as GitHubPullResult;
    },

    async github_push(
      project_id: string,
      body?: { commit_message?: string; branch?: string }
    ): Promise<GitHubPushResult> {
      const res = await http.post<{ success: true; data?: GitHubPushResult } | GitHubPushResult>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}/github/push`,
        body ?? {}
      );
      if (res && typeof res === 'object' && 'data' in res && res.data) {
        return res.data;
      }
      return res as GitHubPushResult;
    },
  };
}
