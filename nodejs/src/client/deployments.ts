/**
 * Deployments API — list/get deployment records for async poll after deploy.
 * MCP: loxtep_observe → list_deployments / get_deployment.
 *
 *   GET /workflows/deployments
 *   GET /workflows/deployments/{deployment_id}
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Deployment,
  DeploymentsListFilters,
  DeploymentsListResponse,
  GetDeploymentOptions,
} from './deployments-types.js';

const DEPLOYMENTS_BASE = '/workflows/deployments';

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function unwrapData<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'data' in res) {
    return (res as { data: T }).data;
  }
  return res as T;
}

export type DeploymentsApi = {
  list: (filters?: DeploymentsListFilters) => Promise<DeploymentsListResponse>;
  get: (deployment_id: string, options?: GetDeploymentOptions) => Promise<Deployment>;
};

/**
 * Create the deployments read API (SDK parity with MCP list_deployments / get_deployment).
 */
export function createDeploymentsApi(http: LoxtepHttpClient): DeploymentsApi {
  return {
    async list(filters: DeploymentsListFilters = {}): Promise<DeploymentsListResponse> {
      const qs = buildQueryString({
        project_id: filters.project_id,
        workflow_id: filters.workflow_id,
        instance_id: filters.instance_id,
        status: filters.status,
        type: filters.type,
        orphaned: filters.orphaned,
        page: filters.page,
        page_size: filters.page_size,
        sort_by: filters.sort_by,
        sort_order: filters.sort_order,
      });
      const res = await http.get<unknown>(`${DEPLOYMENTS_BASE}${qs}`);
      const payload = unwrapData<DeploymentsListResponse | { items?: Deployment[] }>(res);
      return {
        items: payload.items ?? [],
        pagination: (payload as DeploymentsListResponse).pagination,
      };
    },

    async get(deployment_id: string, options?: GetDeploymentOptions): Promise<Deployment> {
      const qs = buildQueryString({
        include_versions: options?.include_versions === true ? true : undefined,
      });
      const res = await http.get<unknown>(
        `${DEPLOYMENTS_BASE}/${encodeURIComponent(deployment_id)}${qs}`
      );
      return unwrapData<Deployment>(res);
    },
  };
}

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
