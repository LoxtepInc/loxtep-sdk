/**
 * Process Intelligence API: decision traces (LOX-1478), entity context (LOX-1627).
 * Backend: process-intelligence GET /organizations/:organization_id/decision-traces
 * and GET /organizations/:organization_id/context.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  DecisionTracesListParams,
  DecisionTracesListResponse,
  EntityContextResponse,
  GetEntityContextParams,
} from './process-intelligence-types.js';

const BASE = '/process-intelligence';

function buildQuery(params?: DecisionTracesListParams): string {
  if (!params || Object.keys(params).length === 0) return '';
  const searchParams = new URLSearchParams();
  if (params.correlation_key != null) searchParams.set('correlation_key', params.correlation_key);
  if (params.correlation_value != null)
    searchParams.set('correlation_value', params.correlation_value);
  if (params.decision_point != null) searchParams.set('decision_point', params.decision_point);
  if (typeof params.is_exception === 'boolean')
    searchParams.set('is_exception', params.is_exception ? 'true' : 'false');
  if (params.precedent != null) searchParams.set('precedent', params.precedent);
  if (params.page != null) searchParams.set('page', String(params.page));
  if (params.page_size != null) searchParams.set('page_size', String(params.page_size));
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Create the process intelligence API surface: decisionTraces.list, getEntityContext.
 */
export function createProcessIntelligenceApi(http: LoxtepHttpClient): {
  decisionTraces: {
    list: (
      organizationId: string,
      params?: DecisionTracesListParams
    ) => Promise<DecisionTracesListResponse['data']>;
  };
  getEntityContext: (
    organizationId: string,
    params: GetEntityContextParams
  ) => Promise<EntityContextResponse['data']>;
} {
  return {
    decisionTraces: {
      async list(
        organizationId: string,
        params?: DecisionTracesListParams
      ): Promise<DecisionTracesListResponse['data']> {
        const path = `${BASE}/organizations/${encodeURIComponent(organizationId)}/decision-traces${buildQuery(params)}`;
        const res = await http.get<DecisionTracesListResponse>(path);
        return res.data;
      },
    },
    async getEntityContext(
      organizationId: string,
      params: GetEntityContextParams
    ): Promise<EntityContextResponse['data']> {
      const searchParams = new URLSearchParams();
      searchParams.set('entity_type', params.entity_type);
      searchParams.set('entity_id', params.entity_id);
      const path = `${BASE}/organizations/${encodeURIComponent(organizationId)}/context?${searchParams.toString()}`;
      const res = await http.get<EntityContextResponse>(path);
      return res.data;
    },
  };
}
