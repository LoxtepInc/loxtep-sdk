/**
 * Semantic layer search / artifact / completeness types (LOX-1243).
 * MCP: search_semantic_layer, get_semantic_artifact, get_semantic_completeness
 * under loxtep_meaning (semantic-layer MS), not loxtep_define.
 */

export type SemanticArtifactType =
  | 'entity'
  | 'glossary_term'
  | 'process_map'
  | 'schema'
  | 'ontology'
  | 'governance_standard';

export interface SearchSemanticLayerInput {
  query: string;
  artifact_types?: SemanticArtifactType[];
  domain?: string;
  industry_relevance?: string;
  page?: number;
  page_size?: number;
}

export interface SemanticSearchResultItem {
  artifact_type: string;
  id: string;
  name: string;
  description: string | null;
  relevance_score: number;
  [key: string]: unknown;
}

export interface SemanticSearchPagination {
  total: number;
  page: number;
  page_size: number;
}

export interface SearchSemanticLayerResult {
  items: SemanticSearchResultItem[];
  pagination: SemanticSearchPagination;
  metadata?: { activation_state?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface GetSemanticArtifactInput {
  artifact_type: SemanticArtifactType;
  /** Artifact UUID (MCP `id`). */
  id?: string;
  /** Alias for `id` (MCP `artifact_id`). */
  artifact_id?: string;
}

export interface GetSemanticCompletenessInput {
  domain_id?: string;
}

export interface DomainCompleteness {
  domain_id: string;
  total_schema_fields: number;
  annotated_fields: number;
  unannotated_fields: number;
  coverage_percentage: number;
  [key: string]: unknown;
}

export interface SemanticCompletenessResult {
  domains: DomainCompleteness[];
  needs_attention: DomainCompleteness[];
  /** Present when MCP/SDK enrichment adds pack activation context. */
  metadata?: { activation_state?: string; [key: string]: unknown };
  [key: string]: unknown;
}
