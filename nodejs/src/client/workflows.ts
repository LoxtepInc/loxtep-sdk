/**
 * Workflows API: listWorkflows, getWorkflowGraph, createWorkflow, deploy.
 * Backend: workflows microservice (/workflows/workflows, graph, projects/:id/deploy).
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  WorkflowsListFilters,
  WorkflowsListResponse,
  GetWorkflowGraphResponse,
  DeployInput,
  DeployResponse,
  CreateWorkflowInput,
} from './workflows-types.js';
import type { Flow } from './flow-types.js';

const WORKFLOWS_BASE = '/workflows/workflows';
const PROJECTS_BASE = '/workflows/projects';

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export type WorkflowsApi = {
  listWorkflows: (filters: WorkflowsListFilters) => Promise<WorkflowsListResponse['data']>;
  getWorkflowGraph: (
    workflow_id: string,
    project_id: string
  ) => Promise<GetWorkflowGraphResponse['data']>;
  createWorkflow: (input: CreateWorkflowInput) => Promise<Flow>;
  deploy: (input: DeployInput) => Promise<DeployResponse['data']>;
};

export function createWorkflowsApi(http: LoxtepHttpClient): WorkflowsApi {
  const api: WorkflowsApi = {
    async listWorkflows(filters: WorkflowsListFilters): Promise<WorkflowsListResponse['data']> {
      const params: Record<string, string | number | undefined> = {
        project_id: filters.project_id,
        page: filters.page ?? 1,
        page_size: filters.page_size ?? 100,
      };
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const qs = buildQueryString(params);
      const res = await http.get<WorkflowsListResponse>(`${WORKFLOWS_BASE}${qs}`);
      return res.data;
    },

    async getWorkflowGraph(
      workflow_id: string,
      project_id: string
    ): Promise<GetWorkflowGraphResponse['data']> {
      const qs = buildQueryString({ project_id });
      const res = await http.get<GetWorkflowGraphResponse>(
        `${WORKFLOWS_BASE}/${encodeURIComponent(workflow_id)}/graph${qs}`
      );
      return res.data;
    },

    async createWorkflow(input: CreateWorkflowInput): Promise<Flow> {
      const res = await http.post<{ success: true; data: Flow }>(WORKFLOWS_BASE, input);
      return res.data;
    },

    async deploy(input: DeployInput): Promise<DeployResponse['data']> {
      const { project_id, instance_id, version_id, force_redeploy } = input;
      const res = await http.post<DeployResponse>(
        `${PROJECTS_BASE}/${encodeURIComponent(project_id)}/deploy`,
        { instance_id, version_id, force_redeploy: force_redeploy ?? false }
      );
      return res.data;
    },
  };
  return api;
}
