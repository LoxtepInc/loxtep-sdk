/**
 * Templates API: list, get (catalog).
 * Canonical API: GET /dataproducts/templates, GET /dataproducts/templates/:template_id (dataproducts).
 * Path must match API Gateway (frontend uses /dataproducts/templates).
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  TemplateSummary,
  TemplatesListResponse,
  TemplatesListFilters,
} from './templates-types.js';

const TEMPLATES_BASE = '/dataproducts/templates';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createTemplatesApi(http: LoxtepHttpClient): {
  list: (filters?: TemplatesListFilters) => Promise<TemplatesListResponse['data']>;
  get: (template_id: string) => Promise<TemplateSummary>;
} {
  return {
    async list(filters?: TemplatesListFilters): Promise<TemplatesListResponse['data']> {
      const params: Record<string, string | number | undefined> = {
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 25,
      };
      if (filters?.category) params.category = filters.category;
      if (filters?.search) params.search = filters.search;
      const qs = buildQueryString(params);
      const res = await http.get<TemplatesListResponse>(`${TEMPLATES_BASE}${qs}`);
      return res.data;
    },

    async get(template_id: string): Promise<TemplateSummary> {
      const res = await http.get<{ success: true; data: TemplateSummary }>(
        `${TEMPLATES_BASE}/${encodeURIComponent(template_id)}`
      );
      return res.data;
    },
  };
}
