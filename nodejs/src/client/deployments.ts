/**
 * Deployments API: list (GET /workflows/deployments).
 * Used by Phase B `loxtep status` / projects list enrichment for deploy age.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Deployment,
  DeploymentsListFilters,
  DeploymentsListResponse,
} from './deployments-types.js';

const DEPLOYMENTS_BASE = '/workflows/deployments';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createDeploymentsApi(http: LoxtepHttpClient): {
  list: (filters?: DeploymentsListFilters) => Promise<DeploymentsListResponse['data']>;
} {
  return {
    async list(filters?: DeploymentsListFilters): Promise<DeploymentsListResponse['data']> {
      const params: Record<string, string | number | undefined> = {
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 20,
        sort_by: filters?.sort_by ?? 'updated_at',
        sort_order: filters?.sort_order ?? 'desc',
      };
      if (filters?.project_id) params.project_id = filters.project_id;
      if (filters?.instance_id) params.instance_id = filters.instance_id;
      if (filters?.status) params.status = filters.status;
      const res = await http.get<DeploymentsListResponse>(
        `${DEPLOYMENTS_BASE}${buildQueryString(params)}`
      );
      return res.data;
    },
  };
}

export type DeploymentsApi = ReturnType<typeof createDeploymentsApi>;

/** Pick the best "latest" deployment for status (prefer status=deployed). */
export function pickLatestDeployment(items: Deployment[]): Deployment | null {
  if (!items.length) return null;
  const deployed = items.filter(d => d.status === 'deployed');
  const pool = deployed.length > 0 ? deployed : items;
  return [...pool].sort((a, b) => {
    const at = Date.parse(a.updated_at || a.created_at || '') || 0;
    const bt = Date.parse(b.updated_at || b.created_at || '') || 0;
    return bt - at;
  })[0]!;
}
