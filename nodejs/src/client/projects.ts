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

export function createProjectsApi(http: LoxtepHttpClient): {
  list: (filters?: ProjectsListFilters) => Promise<ProjectsListResponse['data']>;
  get: (project_id: string) => Promise<Project>;
  create: (body: CreateProjectInput) => Promise<Project>;
  update: (project_id: string, body: UpdateProjectInput) => Promise<Project>;
  delete: (project_id: string) => Promise<{ project_id: string; deleted: boolean }>;
  apply_template: (project_id: string, body: ApplyTemplateInput) => Promise<ApplyTemplateResult>;
  repository: (project_id: string) => Promise<RepositoryBinding>;
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
  };
}
