/**
 * Product definition proposal types (MCP: loxtep_define definition ops).
 * REST: GET/POST /semantic-layer/product-definition for status + approve/apply/withdraw.
 */

export type DefinitionProposalType = 'product_shape' | 'product_semantic_bindings';

export type DefinitionBatchAction = 'status' | 'evidence';

export interface SubmitShapeProposalInput {
  data_product_id: string;
  proposed_definition: Record<string, unknown>;
  base_definition_revision?: string;
  evidence_refs?: string[];
  rationale?: string;
  uncertainty?: string[];
  conflicts?: string[];
  unresolved_decisions?: string[];
  procedure_run_id?: string;
}

export interface SubmitSemanticBindingsInput {
  data_product_id: string;
  base_definition_revision?: string;
  canonical_targets?: unknown[];
  field_mappings?: unknown[];
  concept_alignments?: unknown[];
  relationship_types?: unknown[];
  unresolved_gaps?: unknown[];
  evidence_refs?: string[];
  rationale?: string;
  uncertainty?: string[];
  procedure_run_id?: string;
}

export interface ReviseDefinitionProposalInput {
  semantic_proposal_id: string;
  proposed_definition?: Record<string, unknown>;
  canonical_targets?: unknown[];
  field_mappings?: unknown[];
  concept_alignments?: unknown[];
  relationship_types?: unknown[];
  unresolved_gaps?: unknown[];
  evidence_refs?: string[];
  rationale?: string;
  uncertainty?: string[];
}

export interface ListDefinitionProposalsFilters {
  data_product_id?: string;
  proposal_type?: DefinitionProposalType;
  disposition?: string;
}

export interface RunDefinitionBatchInput {
  data_product_ids: string[];
  action?: DefinitionBatchAction;
}

export type ProductDefinitionAction = 'approve' | 'apply' | 'withdraw';
