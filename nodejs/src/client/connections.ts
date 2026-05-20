/**
 * Connections API. create, update, test, list, get.
 * Backend: workflows microservice /workflows/connections.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Connection,
  ConnectionCreateInput,
  ConnectionUpdateInput,
  ConnectionsListFilters,
  ConnectionsListResponse,
  ConnectionTestResult,
} from './connection-types.js';

const CONNECTIONS_BASE = '/workflows/connections';

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
 * Create the connections API surface (get, list, create, update, test).
 */
export function createConnectionsApi(http: LoxtepHttpClient): {
  get: (id: string) => Promise<Connection>;
  list: (filters?: ConnectionsListFilters) => Promise<ConnectionsListResponse['data']>;
  create: (config: ConnectionCreateInput) => Promise<Connection>;
  update: (id: string, config: ConnectionUpdateInput) => Promise<Connection>;
  delete: (id: string) => Promise<void>;
  test: (id: string) => Promise<ConnectionTestResult>;
} {
  return {
    async get(id: string): Promise<Connection> {
      const res = await http.get<{ success: true; data: Connection }>(
        `${CONNECTIONS_BASE}/${encodeURIComponent(id)}`
      );
      return res.data;
    },

    async list(filters?: ConnectionsListFilters): Promise<ConnectionsListResponse['data']> {
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
      const res = await http.get<ConnectionsListResponse>(`${CONNECTIONS_BASE}${qs}`);
      return res.data;
    },

    async create(config: ConnectionCreateInput): Promise<Connection> {
      const res = await http.post<{ success: true; data: Connection }>(CONNECTIONS_BASE, config);
      return res.data;
    },

    async update(id: string, config: ConnectionUpdateInput): Promise<Connection> {
      const res = await http.put<{ success: true; data: Connection }>(
        `${CONNECTIONS_BASE}/${encodeURIComponent(id)}`,
        config
      );
      return res.data;
    },

    async delete(id: string): Promise<void> {
      await http.delete(`${CONNECTIONS_BASE}/${encodeURIComponent(id)}`);
    },

    async test(id: string): Promise<ConnectionTestResult> {
      const res = await http.post<{ success: true; data: ConnectionTestResult }>(
        `${CONNECTIONS_BASE}/${encodeURIComponent(id)}/test`,
        {}
      );
      return res.data;
    },
  };
}
