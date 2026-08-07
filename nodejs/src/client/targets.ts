/**
 * Targets API — delivery-side connector bindings (workflow connection nodes at the
 * tail of a delivery workflow). Parallel to triggers (ingest-head connections).
 *
 * Backend: project entities (`/workflows/projects/{project_id}/entities/.../connections`).
 * Prefer `save_workflow_bundle` / `loxtep delivery create` for new delivery flows.
 *
 * Does NOT call `/dataproducts/:id/consumptions` (that architecture was removed).
 */

import { randomUUID } from 'node:crypto';
import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Target,
  TargetCreateInput,
  TargetUpdateInput,
  TargetsListFilters,
  TargetsListResponse,
  TargetTestResult,
} from './target-types.js';

function requireProjectId(projectId: string | undefined, action: string): string {
  if (!projectId) {
    throw new Error(
      `targets.${action} requires project_id. Pass filters.project_id / config.project_id, or use save_workflow_bundle.`
    );
  }
  return projectId;
}

function entitiesBase(projectId: string): string {
  return `/workflows/projects/${encodeURIComponent(projectId)}/entities`;
}

function connectionPath(projectId: string, connectionId: string, workflowId?: string): string {
  const qs = workflowId ? `?workflow_id=${encodeURIComponent(workflowId)}` : '';
  return `${entitiesBase(projectId)}/connections/${encodeURIComponent(connectionId)}${qs}`;
}

function paginate(items: Target[], page: number, pageSize: number): TargetsListResponse['data'] {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  };
}

async function resolveWorkflowId(
  http: LoxtepHttpClient,
  projectId: string,
  connectionId: string,
  explicit?: string
): Promise<string> {
  if (explicit) return explicit;

  const res = await http.get<{
    success: true;
    data: { connections?: Target[] };
  }>(entitiesBase(projectId));
  const matches = (res.data?.connections ?? []).filter(c => c.connection_id === connectionId);
  if (matches.length === 0) {
    throw new Error(
      `Target ${connectionId} not found in project ${projectId}. Run \`loxtep targets list\` first.`
    );
  }

  const workflowIds = [
    ...new Set(
      matches
        .map(m => (typeof m.workflow_id === 'string' ? m.workflow_id : ''))
        .filter(Boolean)
    ),
  ];
  if (workflowIds.length === 0) {
    throw new Error(
      `Target ${connectionId} has no workflow_id in the project entities list; pass --workflow-id explicitly.`
    );
  }
  if (workflowIds.length > 1) {
    throw new Error(
      `Multiple workflows own connection_id ${connectionId}: ${workflowIds.join(', ')}. Pass --workflow-id to disambiguate.`
    );
  }
  return workflowIds[0]!;
}

export interface TargetsApi {
  get: (id: string, opts?: { project_id?: string; workflow_id?: string }) => Promise<Target>;
  list: (filters?: TargetsListFilters) => Promise<TargetsListResponse['data']>;
  create: (config: TargetCreateInput) => Promise<Target>;
  update: (
    id: string,
    config: TargetUpdateInput,
    opts?: { project_id?: string; workflow_id?: string }
  ) => Promise<Target>;
  delete: (id: string, opts?: { project_id?: string; workflow_id?: string }) => Promise<void>;
  test: (id: string, opts?: { project_id?: string; workflow_id?: string }) => Promise<TargetTestResult>;
}

/**
 * Create the targets API surface (parallel to triggers — same connections entity).
 */
export function createTargetsApi(http: LoxtepHttpClient): TargetsApi {
  const api: TargetsApi = {
    async get(
      id: string,
      opts?: { project_id?: string; workflow_id?: string }
    ): Promise<Target> {
      const projectId = requireProjectId(opts?.project_id, 'get');
      const workflowId = await resolveWorkflowId(http, projectId, id, opts?.workflow_id);
      const res = await http.get<{ success: true; data: Target }>(
        connectionPath(projectId, id, workflowId)
      );
      return res.data;
    },

    async list(filters?: TargetsListFilters): Promise<TargetsListResponse['data']> {
      const projectId = requireProjectId(filters?.project_id, 'list');
      const page = filters?.page ?? 1;
      const pageSize = filters?.page_size ?? 50;
      const res = await http.get<{
        success: true;
        data: { connections?: Target[] };
      }>(entitiesBase(projectId));
      let items = (res.data?.connections ?? []) as Target[];
      // Delivery targets are typically outbound; default filter when direction set.
      if (filters?.direction) {
        items = items.filter(
          t =>
            String(t.direction ?? '') === filters.direction ||
            String((t.configuration as { direction?: string } | undefined)?.direction ?? '') ===
              filters.direction ||
            String((t.metadata as { direction?: string } | undefined)?.direction ?? '') ===
              filters.direction
        );
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        items = items.filter(
          t =>
            String(t.name ?? '')
              .toLowerCase()
              .includes(q) ||
            String(t.key ?? '')
              .toLowerCase()
              .includes(q)
        );
      }
      if (filters?.type) {
        const types = Array.isArray(filters.type) ? filters.type : [filters.type];
        items = items.filter(t => types.includes(String(t.type)));
      }
      if (filters?.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        items = items.filter(t => statuses.includes(String(t.status)));
      }
      if (filters?.workflow_id) {
        items = items.filter(t => String(t.workflow_id ?? '') === filters.workflow_id);
      }
      return paginate(items, page, pageSize);
    },

    async create(config: TargetCreateInput): Promise<Target> {
      const projectId = requireProjectId(config.project_id, 'create');
      const workflowId = config.workflow_id;
      if (!workflowId) {
        throw new Error(
          'targets.create requires workflow_id. Prefer loxtep delivery create / save_workflow_bundle.'
        );
      }
      const connectionId = randomUUID();
      const now = new Date().toISOString();
      const direction = config.direction ?? 'outbound';
      const body: Target = {
        connection_id: connectionId,
        project_id: projectId,
        workflow_id: workflowId,
        connector_id: config.connector_id,
        connector_type: config.connector_type,
        key: config.key ?? config.name,
        name: config.name,
        type: config.type,
        status: config.status ?? 'active',
        direction,
        data: config.data ?? '{}',
        configuration: { ...(config.configuration ?? {}), direction },
        metadata: { ...(config.metadata ?? {}), direction },
        verified: config.verified ?? false,
        draft: config.draft ?? true,
        created_at: now,
        updated_at: now,
      };
      const res = await http.put<{ success: true; data: Target }>(
        connectionPath(projectId, connectionId, workflowId),
        body
      );
      return res.data ?? body;
    },

    async update(
      id: string,
      config: TargetUpdateInput,
      opts?: { project_id?: string; workflow_id?: string }
    ): Promise<Target> {
      const projectId = requireProjectId(opts?.project_id ?? config.project_id, 'update');
      const workflowId = await resolveWorkflowId(
        http,
        projectId,
        id,
        opts?.workflow_id ?? config.workflow_id
      );
      const existing = await api.get(id, { project_id: projectId, workflow_id: workflowId });
      const merged = {
        ...existing,
        ...config,
        connection_id: id,
        project_id: projectId,
        workflow_id: workflowId,
        updated_at: new Date().toISOString(),
      };
      const res = await http.put<{ success: true; data: Target }>(
        connectionPath(projectId, id, workflowId),
        merged
      );
      return res.data ?? (merged as Target);
    },

    async delete(
      id: string,
      opts?: { project_id?: string; workflow_id?: string }
    ): Promise<void> {
      const projectId = requireProjectId(opts?.project_id, 'delete');
      const workflowId = await resolveWorkflowId(http, projectId, id, opts?.workflow_id);
      await http.delete(connectionPath(projectId, id, workflowId));
    },

    async test(
      id: string,
      opts?: { project_id?: string; workflow_id?: string }
    ): Promise<TargetTestResult> {
      const target = await api.get(id, opts);
      return {
        success: true,
        message: `Target "${target.name}" loaded. Use MCP test_trigger for live connectivity checks.`,
        connection_id: id,
        tested_at: new Date().toISOString(),
      };
    },
  };
  return api;
}
