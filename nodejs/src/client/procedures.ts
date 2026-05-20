/**
 * Procedures API. list.
 * Backend: process-intelligence microservice /process-intelligence/organizations/:organization_id/procedures.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { Procedure, ProceduresListResponse } from './procedures-types.js';

const PROCESS_INTELLIGENCE_BASE = '/process-intelligence';

function buildQueryString(params: Record<string, number>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Create the procedures API surface.
 */
export function createProceduresApi(http: LoxtepHttpClient): {
  list: (
    organization_id: string,
    params?: { page?: number; page_size?: number }
  ) => Promise<{ items: Procedure[]; pagination: ProceduresListResponse['data']['pagination'] }>;
} {
  return {
    async list(organization_id: string, params?: { page?: number; page_size?: number }) {
      const qs = buildQueryString({
        page: params?.page ?? 1,
        page_size: params?.page_size ?? 20,
      });
      const res = await http.get<ProceduresListResponse>(
        `${PROCESS_INTELLIGENCE_BASE}/organizations/${encodeURIComponent(organization_id)}/procedures${qs}`
      );
      return {
        items: res.data.items,
        pagination: res.data.pagination,
      };
    },
  };
}
