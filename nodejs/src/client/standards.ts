/**
 * Standards API (customer term for data standards): list, get.
 * Backend: GET /governance/standards, GET /governance/standards/:standard_id.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { Standard, StandardsListResponse, StandardsListFilters } from './standards-types.js';

const STANDARDS_BASE = '/governance/standards';

function buildQueryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createStandardsApi(http: LoxtepHttpClient): {
  get: (standard_id: string) => Promise<Standard>;
  list: (filters?: StandardsListFilters) => Promise<StandardsListResponse['data']>;
} {
  return {
    async list(filters?: StandardsListFilters): Promise<StandardsListResponse['data']> {
      const params: Record<string, string | number | undefined | null> = {
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 50,
      };
      if (filters?.domain_id !== undefined) params.domain_id = filters.domain_id;
      if (filters?.status) params.status = filters.status;
      if (filters?.type) params.type = filters.type;
      const qs = buildQueryString(params);
      const res = await http.get<StandardsListResponse>(`${STANDARDS_BASE}${qs}`);
      return res.data;
    },

    async get(standard_id: string): Promise<Standard> {
      const res = await http.get<{ success: true; data: Standard }>(
        `${STANDARDS_BASE}/${encodeURIComponent(standard_id)}`
      );
      return res.data;
    },
  };
}
