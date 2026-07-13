/**
 * Connectors API. list, get, create, update, delete, test, oauth.
 * Backend: connectors microservice /connectors/connectors.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Connector,
  ConnectorsListFilters,
  ConnectorsListResponse,
  CreateConnectorInput,
  UpdateConnectorInput,
  ConnectorTestResult,
} from './connectors-types.js';

const CONNECTORS_BASE = '/connectors/connectors';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Create the connectors API surface.
 */
export function createConnectorsApi(http: LoxtepHttpClient): {
  list: (
    filters?: ConnectorsListFilters
  ) => Promise<{ items: Connector[]; pagination: ConnectorsListResponse['pagination'] }>;
  get: (connector_id: string) => Promise<Connector>;
  create: (input: CreateConnectorInput) => Promise<Connector>;
  update: (connector_id: string, input: UpdateConnectorInput) => Promise<Connector>;
  delete: (connector_id: string) => Promise<void>;
  test: (connector_id: string) => Promise<ConnectorTestResult>;
  get_oauth_url: (
    connector_id: string,
    opts?: { callback_url?: string; toolkit?: string }
  ) => Promise<{ oauth_url: string }>;
} {
  return {
    async list(filters?: ConnectorsListFilters) {
      const params: Record<string, string | number | undefined> = {
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 20,
        sort_by: filters?.sort_by ?? 'created_at',
        sort_order: filters?.sort_order ?? 'desc',
      };
      if (filters?.organization_id) params.organization_id = filters.organization_id;
      if (filters?.connector_type) params.connector_type = filters.connector_type;
      const qs = buildQueryString(params);
      const res = await http.get<ConnectorsListResponse>(`${CONNECTORS_BASE}${qs}`);
      return { items: res.items, pagination: res.pagination };
    },

    async get(connector_id: string): Promise<Connector> {
      const res = await http.get<{ success: true; data: Connector } | Connector>(
        `${CONNECTORS_BASE}/${encodeURIComponent(connector_id)}`
      );
      const r = res as { data?: Connector };
      return r?.data ?? (res as Connector);
    },

    async create(input: CreateConnectorInput): Promise<Connector> {
      const res = await http.post<{ success: true; data: Connector } | Connector>(
        CONNECTORS_BASE,
        input
      );
      const r = res as { data?: Connector };
      return r?.data ?? (res as Connector);
    },

    async update(connector_id: string, input: UpdateConnectorInput): Promise<Connector> {
      const res = await http.put<{ success: true; data: Connector } | Connector>(
        `${CONNECTORS_BASE}/${encodeURIComponent(connector_id)}`,
        input
      );
      const r = res as { data?: Connector };
      return r?.data ?? (res as Connector);
    },

    async delete(connector_id: string): Promise<void> {
      await http.delete(`${CONNECTORS_BASE}/${encodeURIComponent(connector_id)}`);
    },

    async test(connector_id: string): Promise<ConnectorTestResult> {
      const res = await http.post<
        { success: true; data: ConnectorTestResult } | ConnectorTestResult
      >(`${CONNECTORS_BASE}/${encodeURIComponent(connector_id)}/test`, {});
      const r = res as { data?: ConnectorTestResult };
      return r?.data ?? (res as ConnectorTestResult);
    },

    async get_oauth_url(
      connector_id: string,
      opts?: { callback_url?: string; toolkit?: string }
    ): Promise<{ oauth_url: string }> {
      const params: Record<string, string> = {};
      if (opts?.callback_url) params.callback_url = opts.callback_url;
      if (opts?.toolkit) params.toolkit = opts.toolkit;
      const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
      const res = await http.get<{ redirect_url: string }>(
        `${CONNECTORS_BASE}/${encodeURIComponent(connector_id)}/oauth${qs}`
      );
      return { oauth_url: (res as { redirect_url: string }).redirect_url };
    },
  };
}
