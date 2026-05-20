/**
 * Domains API: list, get.
 * Backend: GET /organizations/domains, GET /organizations/domains/:domain_id.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { Domain, DomainsListResponse, DomainsListFilters } from './domains-types.js';

const DOMAINS_BASE = '/organizations/domains';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createDomainsApi(http: LoxtepHttpClient): {
  get: (domain_id: string) => Promise<Domain>;
  list: (filters?: DomainsListFilters) => Promise<DomainsListResponse['data']>;
} {
  return {
    async list(filters?: DomainsListFilters): Promise<DomainsListResponse['data']> {
      const params: Record<string, string | number | undefined> = {
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 50,
      };
      if (filters?.organization_id) params.organization_id = filters.organization_id;
      if (filters?.status) params.status = filters.status;
      if (filters?.search) params.search = filters.search;
      const qs = buildQueryString(params);
      const res = await http.get<DomainsListResponse>(`${DOMAINS_BASE}${qs}`);
      return res.data;
    },

    async get(domain_id: string): Promise<Domain> {
      const res = await http.get<{ success: true; data: Domain }>(
        `${DOMAINS_BASE}/${encodeURIComponent(domain_id)}`
      );
      return res.data;
    },
  };
}
