/**
 * Process Intelligence API types (LOX-1478, LOX-1627).
 * decision_traces list, entity context.
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
