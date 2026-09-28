/**
 * Semantic proposals types (Phase 2).
 * REST: GET/PUT /semantic-layer/semantic-proposals
 */

export type SemanticProposalDisposition = 'pending' | 'accepted' | 'edited' | 'rejected';

export interface SemanticProposal {
  semantic_proposal_id: string;
  organization_id: string;
  data_product_id?: string | null;
  proposal_type: string;
  target_artifact_type?: string | null;
  target_path?: string | null;
  proposal_payload: Record<string, unknown>;
  confidence?: number | null;
  disposition: SemanticProposalDisposition | string;
  proposed_by_model?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListSemanticProposalsFilters {
  page?: number;
  page_size?: number;
  proposal_type?: string;
  disposition?: SemanticProposalDisposition;
  data_product_id?: string;
}

export interface SemanticProposalsPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ListSemanticProposalsResult {
  items: SemanticProposal[];
  pagination: SemanticProposalsPagination;
}

export interface ResolveSemanticProposalInput {
  disposition: 'accepted' | 'edited' | 'rejected';
  resolution_note?: string;
}

export interface ResolveSemanticProposalResult {
  semantic_proposal_id: string;
  disposition: string;
}

export interface BatchResolveSemanticProposalsInput {
  semantic_proposal_ids: string[];
  disposition: 'accepted' | 'edited' | 'rejected';
  resolution_note?: string;
}

export interface BatchResolveSemanticProposalsResult {
  results: Array<
    | { semantic_proposal_id: string; disposition: string; ok: true }
    | { semantic_proposal_id: string; ok: false; error: string }
  >;
  succeeded: number;
  failed: number;
}
