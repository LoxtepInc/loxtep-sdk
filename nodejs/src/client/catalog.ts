/**
 * Catalog (search) API. search. Backend: GET /search. MCP parity.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { CatalogSearchFilters, CatalogSearchResponse } from './catalog-types.js';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createCatalogApi(http: LoxtepHttpClient): {
  search: (query: string, filters?: CatalogSearchFilters) => Promise<CatalogSearchResponse>;
} {
  return {
    async search(query: string, filters?: CatalogSearchFilters): Promise<CatalogSearchResponse> {
      const qs = buildQueryString({
        q: query,
        type: filters?.type ?? undefined,
        limit: filters?.limit ?? 20,
        offset: filters?.offset ?? 0,
      });
      const res = await http.get<CatalogSearchResponse>(`/search${qs}`);
      const payload = (res as { data?: CatalogSearchResponse }).data ?? res;
      return payload as CatalogSearchResponse;
    },
  };
}
