/**
 * Triggers API — ingest-side source bindings. create, update, test, list, get.
 * Backend: workflows microservice /workflows/connections.
 * ("connections" is the backend term; the SDK surface names these `triggers`.)
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Trigger,
  TriggerCreateInput,
  TriggerUpdateInput,
  TriggersListFilters,
  TriggersListResponse,
  TriggerTestResult,
} from './trigger-types.js';

const TRIGGERS_BASE = '/workflows/connections';

function buildQueryString(
  params: Record<string, string | number | boolean | string[] | undefined>
): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      search.set(k, v.join(','));
    } else {
      search.set(k, String(v));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Create the triggers API surface (get, list, create, update, delete, test).
 */
export function createTriggersApi(http: LoxtepHttpClient): {
  get: (id: string) => Promise<Trigger>;
  list: (filters?: TriggersListFilters) => Promise<TriggersListResponse['data']>;
  create: (config: TriggerCreateInput) => Promise<Trigger>;
  update: (id: string, config: TriggerUpdateInput) => Promise<Trigger>;
  delete: (id: string) => Promise<void>;
  test: (id: string) => Promise<TriggerTestResult>;
} {
  return {
    async get(id: string): Promise<Trigger> {
      const res = await http.get<{ success: true; data: Trigger }>(
        `${TRIGGERS_BASE}/${encodeURIComponent(id)}`
      );
      return res.data;
    },

    async list(filters?: TriggersListFilters): Promise<TriggersListResponse['data']> {
      const params: Record<string, string | number | boolean | string[] | undefined> = {
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 50,
      };
      if (filters?.search) params.search = filters.search;
      if (filters?.type) params.type = Array.isArray(filters.type) ? filters.type : [filters.type];
      if (filters?.status)
        params.status = Array.isArray(filters.status) ? filters.status : [filters.status];
      if (filters?.verified !== undefined) params.verified = filters.verified;
      if (filters?.draft !== undefined) params.draft = filters.draft;
      const qs = buildQueryString(params);
      const res = await http.get<TriggersListResponse>(`${TRIGGERS_BASE}${qs}`);
      return res.data;
    },

    async create(config: TriggerCreateInput): Promise<Trigger> {
      const res = await http.post<{ success: true; data: Trigger }>(TRIGGERS_BASE, config);
      return res.data;
    },

    async update(id: string, config: TriggerUpdateInput): Promise<Trigger> {
      const res = await http.put<{ success: true; data: Trigger }>(
        `${TRIGGERS_BASE}/${encodeURIComponent(id)}`,
        config
      );
      return res.data;
    },

    async delete(id: string): Promise<void> {
      await http.delete(`${TRIGGERS_BASE}/${encodeURIComponent(id)}`);
    },

    async test(id: string): Promise<TriggerTestResult> {
      const res = await http.post<{ success: true; data: TriggerTestResult }>(
        `${TRIGGERS_BASE}/${encodeURIComponent(id)}/test`,
        {}
      );
      return res.data;
    },
  };
}
