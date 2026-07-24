/**
 * Triggers API — ingest-side source bindings (workflow connection nodes).
 * Backend: project entities API (`/workflows/projects/{project_id}/entities`).
 * ("connections" is the backend term; the SDK surface names these `triggers`.)
 *
 * Prefer authoring new triggers via `save_workflow_bundle` / `loxtep ingest create`.
 */

import { randomUUID } from 'node:crypto';
import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Trigger,
  TriggerCreateInput,
  TriggerUpdateInput,
  TriggersListFilters,
  TriggersListResponse,
  TriggerTestResult,
} from './trigger-types.js';

function requireProjectId(projectId: string | undefined, action: string): string {
  if (!projectId) {
    throw new Error(
      `triggers.${action} requires project_id. Pass filters.project_id / config.project_id, or use save_workflow_bundle.`
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

function paginate(
  items: Trigger[],
  page: number,
  pageSize: number
): TriggersListResponse['data'] {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
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

/**
 * Create the triggers API surface (get, list, create, update, delete, test).
 */
export function createTriggersApi(http: LoxtepHttpClient): {
  get: (id: string, opts?: { project_id?: string; workflow_id?: string }) => Promise<Trigger>;
  list: (filters?: TriggersListFilters) => Promise<TriggersListResponse['data']>;
  create: (config: TriggerCreateInput) => Promise<Trigger>;
  update: (
    id: string,
    config: TriggerUpdateInput,
    opts?: { project_id?: string; workflow_id?: string }
  ) => Promise<Trigger>;
  delete: (id: string, opts?: { project_id?: string; workflow_id?: string }) => Promise<void>;
  test: (id: string, opts?: { project_id?: string; workflow_id?: string }) => Promise<TriggerTestResult>;
} {
  return {
    async get(
      id: string,
      opts?: { project_id?: string; workflow_id?: string }
    ): Promise<Trigger> {
      const projectId = requireProjectId(opts?.project_id, 'get');
      const res = await http.get<{ success: true; data: Trigger }>(
        connectionPath(projectId, id, opts?.workflow_id)
      );
      return res.data;
    },

    async list(filters?: TriggersListFilters): Promise<TriggersListResponse['data']> {
      const projectId = requireProjectId(filters?.project_id, 'list');
      const page = filters?.page ?? 1;
      const pageSize = filters?.page_size ?? 50;
      const res = await http.get<{
        success: true;
        data: { connections?: Trigger[] };
      }>(entitiesBase(projectId));
      let items = (res.data?.connections ?? []) as Trigger[];
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
      if (filters?.verified !== undefined) {
        items = items.filter(t => Boolean(t.verified) === filters.verified);
      }
      if (filters?.draft !== undefined) {
        items = items.filter(t => Boolean(t.draft) === filters.draft);
      }
      return paginate(items, page, pageSize);
    },

    async create(config: TriggerCreateInput): Promise<Trigger> {
      const projectId = requireProjectId(config.project_id, 'create');
      const workflowId = config.workflow_id;
      if (!workflowId) {
        throw new Error(
          'triggers.create requires workflow_id (connection nodes are workflow-scoped). Prefer loxtep ingest create / save_workflow_bundle.'
        );
      }
      const connectionId = randomUUID();
      const now = new Date().toISOString();
      const body: Trigger = {
        connection_id: connectionId,
        project_id: projectId,
        workflow_id: workflowId,
        key: config.key,
        name: config.name,
        type: config.type,
        status: config.status ?? 'active',
        data: config.data ?? '{}',
        configuration: config.configuration ?? {},
        metadata: config.metadata ?? {},
        verified: config.verified ?? false,
        draft: config.draft ?? true,
        created_at: now,
        updated_at: now,
      };
      const res = await http.put<{ success: true; data: Trigger }>(
        connectionPath(projectId, connectionId, workflowId),
        body
      );
      return res.data ?? body;
    },

    async update(
      id: string,
      config: TriggerUpdateInput,
      opts?: { project_id?: string; workflow_id?: string }
    ): Promise<Trigger> {
      const projectId = requireProjectId(opts?.project_id ?? config.project_id, 'update');
      const workflowId = opts?.workflow_id ?? config.workflow_id;
      const existing = await this.get(id, { project_id: projectId, workflow_id: workflowId });
      const merged = {
        ...existing,
        ...config,
        connection_id: id,
        project_id: projectId,
        updated_at: new Date().toISOString(),
      };
      const res = await http.put<{ success: true; data: Trigger }>(
        connectionPath(projectId, id, workflowId ?? String(existing.workflow_id ?? '')),
        merged
      );
      return res.data ?? (merged as Trigger);
    },

    async delete(
      id: string,
      opts?: { project_id?: string; workflow_id?: string }
    ): Promise<void> {
      const projectId = requireProjectId(opts?.project_id, 'delete');
      const qs = opts?.workflow_id
        ? `?workflow_id=${encodeURIComponent(opts.workflow_id)}`
        : '';
      await http.delete(
        `${entitiesBase(projectId)}/connections/${encodeURIComponent(id)}${qs}`
      );
    },

    async test(
      id: string,
      opts?: { project_id?: string; workflow_id?: string }
    ): Promise<TriggerTestResult> {
      // Connectivity probe: load entity; if configuration has an HTTP URL, report reachable shape.
      const trigger = await this.get(id, opts);
      const cfg = (trigger.configuration ?? {}) as Record<string, unknown>;
      const probe =
        (typeof cfg.url === 'string' && cfg.url) ||
        (typeof cfg.base_url === 'string' && cfg.base_url) ||
        (typeof cfg.endpoint === 'string' && cfg.endpoint) ||
        null;
      return {
        success: true,
        message: probe
          ? `Trigger "${trigger.name}" loaded; probe URL present (${probe}). Live HTTP probe is available via MCP test_trigger.`
          : `Trigger "${trigger.name}" loaded. No HTTP probe URL in configuration; use MCP test_trigger for live checks.`,
        details: { connection_id: id, has_probe_url: Boolean(probe) },
        tested_at: new Date().toISOString(),
      };
    },
  };
}
