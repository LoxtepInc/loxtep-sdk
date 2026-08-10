/**
 * Process Intelligence API types (LOX-1478, LOX-1627, LOX-1226).
 * decision_traces list/create, causal chain, similar, entity context.
 */

export interface GetEntityContextParams {
  entity_type: string;
  entity_id: string;
}

export interface EntityContextResponse {
  success: true;
  data: unknown; // Entity-specific; structure depends on entity_type
}

export interface DecisionTraceListItem {
  trace_id: string;
  decision_point: string;
  timestamp: string;
  is_exception: boolean;
  decision_maker: string | null;
  reason: string | null;
  precedent_id: string | null;
  correlation_key: string | null;
  correlation_value: string | null;
}

export interface DecisionTracesListParams {
  correlation_key?: string;
  correlation_value?: string;
  decision_point?: string;
  is_exception?: boolean;
  precedent?: string;
  page?: number;
  page_size?: number;
}

export interface DecisionTracesListResponse {
  success: true;
  data: {
    items: DecisionTraceListItem[];
    pagination: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
    };
  };
}

/** Canonical causal / precedent relation types (LOX-1226). */
export const CAUSAL_LINK_TYPES = ['CAUSED', 'INFLUENCED', 'PRECEDENT_FOR'] as const;
export type CausalLinkType = (typeof CAUSAL_LINK_TYPES)[number];

/** Known entity types for entity-level decision traces. */
export const DECISION_TRACE_ENTITY_TYPES = [
  'order',
  'customer',
  'return',
  'refund',
  'shipment',
  'subscription',
  'ticket',
  'product',
] as const;
export type DecisionTraceEntityType = (typeof DECISION_TRACE_ENTITY_TYPES)[number];

export interface CausalLinkInput {
  target_trace_id: string;
  relation_type: CausalLinkType;
}

/** POST /decision-traces entity-level body (includes optional LOX-1226 links). */
export interface CreateDecisionTraceInput {
  entity_type: DecisionTraceEntityType;
  entity_id: string;
  decision_point: string;
  decision: string;
  reason?: string;
  is_exception?: boolean;
  /** Convenience: write PRECEDENT_FOR from this precedent → new trace. */
  precedent_id?: string;
  /** Typed causal links from the new trace → targets. */
  links?: CausalLinkInput[];
  metadata?: Record<string, unknown>;
}

export interface CreatedCausalLink {
  from_trace_id: string;
  to_trace_id: string;
  relation_type: string;
}

export interface CreateDecisionTraceResult {
  trace_id: string;
  entity_type: string;
  entity_id: string;
  decision_point: string;
  decision: string;
  reason: string | null;
  is_exception: boolean;
  precedent_id: string | null;
  links: CreatedCausalLink[];
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string;
}

export interface CreateDecisionTraceResponse {
  success: true;
  data: CreateDecisionTraceResult;
}

export type CausalChainDirection = 'forward' | 'backward' | 'both';

export interface GetDecisionChainParams {
  max_depth?: number;
  direction?: CausalChainDirection;
}

export interface CausalChainHop {
  from_trace_id: string;
  to_trace_id: string;
  relation_type: CausalLinkType;
  /** Edge direction relative to the seed. */
  direction: 'outgoing' | 'incoming';
  depth: number;
}

export interface DecisionChainResult {
  seed_trace_id: string;
  nodes: string[];
  hops: CausalChainHop[];
}

export interface GetDecisionChainResponse {
  success: true;
  data: DecisionChainResult;
}

export interface GetSimilarDecisionsParams {
  limit?: number;
}

export interface SimilarDecisionCandidate {
  trace_id: string;
  decision_point: string;
  decision: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_exception: boolean;
  precedent_id: string | null;
  created_at: string;
  score: number;
  match_reasons: string[];
}

export interface SimilarDecisionsResult {
  seed_trace_id: string;
  items: SimilarDecisionCandidate[];
}

export interface GetSimilarDecisionsResponse {
  success: true;
  data: SimilarDecisionsResult;
}
