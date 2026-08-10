/**
 * Process Intelligence API: decision traces (LOX-1478), entity context (LOX-1627),
 * causal chain / similar / linked create (LOX-1226).
 *
 * Backend (process-intelligence microservice):
 *   GET  /organizations/:organization_id/decision-traces
 *   POST /organizations/:organization_id/decision-traces
 *   GET  /organizations/:organization_id/decision-traces/:trace_id/chain
 *   GET  /organizations/:organization_id/decision-traces/:trace_id/similar
 *   GET  /organizations/:organization_id/context
 *
 * Thin HTTP wrap only — platform owns graph walk / ranking logic.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  CreateDecisionTraceInput,
  CreateDecisionTraceResponse,
  CreateDecisionTraceResult,
  DecisionChainResult,
  DecisionTracesListParams,
  DecisionTracesListResponse,
  EntityContextResponse,
  GetDecisionChainParams,
  GetDecisionChainResponse,
  GetEntityContextParams,
  GetSimilarDecisionsParams,
  GetSimilarDecisionsResponse,
  SimilarDecisionsResult,
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

function buildChainQuery(params?: GetDecisionChainParams): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  if (params.max_depth != null) searchParams.set('max_depth', String(params.max_depth));
  if (params.direction != null) searchParams.set('direction', params.direction);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

function buildSimilarQuery(params?: GetSimilarDecisionsParams): string {
  if (!params || params.limit == null) return '';
  return `?limit=${encodeURIComponent(String(params.limit))}`;
}

function tracesBase(organizationId: string): string {
  return `${BASE}/organizations/${encodeURIComponent(organizationId)}/decision-traces`;
}

export type ProcessIntelligenceApi = ReturnType<typeof createProcessIntelligenceApi>;

/**
 * Create the process intelligence API surface:
 * decisionTraces.list / create / getChain / getSimilar, getEntityContext.
 */
export function createProcessIntelligenceApi(http: LoxtepHttpClient): {
  decisionTraces: {
    list: (
      organizationId: string,
      params?: DecisionTracesListParams
    ) => Promise<DecisionTracesListResponse['data']>;
    create: (
      organizationId: string,
      body: CreateDecisionTraceInput
    ) => Promise<CreateDecisionTraceResult>;
    getChain: (
      organizationId: string,
      traceId: string,
      params?: GetDecisionChainParams
    ) => Promise<DecisionChainResult>;
    getSimilar: (
      organizationId: string,
      traceId: string,
      params?: GetSimilarDecisionsParams
    ) => Promise<SimilarDecisionsResult>;
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
        const path = `${tracesBase(organizationId)}${buildQuery(params)}`;
        const res = await http.get<DecisionTracesListResponse>(path);
        return res.data;
      },

      async create(
        organizationId: string,
        body: CreateDecisionTraceInput
      ): Promise<CreateDecisionTraceResult> {
        const res = await http.post<CreateDecisionTraceResponse>(tracesBase(organizationId), body);
        return res.data;
      },

      async getChain(
        organizationId: string,
        traceId: string,
        params?: GetDecisionChainParams
      ): Promise<DecisionChainResult> {
        const path = `${tracesBase(organizationId)}/${encodeURIComponent(traceId)}/chain${buildChainQuery(params)}`;
        const res = await http.get<GetDecisionChainResponse>(path);
        return res.data;
      },

      async getSimilar(
        organizationId: string,
        traceId: string,
        params?: GetSimilarDecisionsParams
      ): Promise<SimilarDecisionsResult> {
        const path = `${tracesBase(organizationId)}/${encodeURIComponent(traceId)}/similar${buildSimilarQuery(params)}`;
        const res = await http.get<GetSimilarDecisionsResponse>(path);
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
