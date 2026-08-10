/**
 * Context mining API types (MCP: loxtep_review mining ops).
 * MCP ops: run_mining_pass, list_candidates, act_on_candidate.
 *
 * REST (graph):
 *   POST /graph/organizations/{org}/mining/run
 *   GET  /graph/organizations/{org}/mining/candidates
 *   POST /graph/organizations/{org}/mining/candidates/{candidate_id}/act
 *
 * Invariant: mining only surfaces candidates — never auto-commits.
 * act_on_candidate(approve) routes through CDLC at `in_review`.
 */

export interface MiningApiDeps {
  /** Default organization for mining calls; overridable per call. */
  organization_id?: string;
}

/** Signal sources the mining pass can analyze. */
export type MiningSignalSource =
  | 'semantic_definitions'
  | 'decision_traces'
  | 'event_sequences'
  | (string & {});

export type MiningCandidateType =
  | 'semantic_conflict'
  | 'procedure'
  | 'promotion'
  | 'entity_fact'
  | (string & {});

export type MiningCandidateStatus = 'candidate' | 'approved' | 'rejected' | (string & {});

export type MiningCandidateAction = 'approve' | 'reject';

export interface MiningScopeFilters {
  entity_types?: string[];
  from_date?: string;
  to_date?: string;
  [key: string]: unknown;
}

export interface RunMiningPassInput {
  organization_id?: string;
  /** Signal sources to mine (optional — platform defaults to all). */
  signal_sources?: MiningSignalSource[] | null;
  /** Scope filters to narrow the mining pass (optional). */
  scope_filters?: MiningScopeFilters | null;
}

/** Platform payload for a mining pass; shape may grow — keep index signature. */
export interface RunMiningPassResult {
  mining_run_id?: string;
  candidates?: MiningCandidate[];
  candidate_ids?: string[];
  candidates_created?: number;
  [key: string]: unknown;
}

export interface ListCandidatesFilters {
  organization_id?: string;
  candidate_type?: MiningCandidateType;
  status?: MiningCandidateStatus;
  mining_run_id?: string;
}

export interface MiningCandidate {
  id: string;
  candidate_type: MiningCandidateType;
  status: MiningCandidateStatus;
  payload: Record<string, unknown>;
  provenance_refs: string[];
  mining_run_id: string | null;
  organization_id: string;
  created_at?: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  [key: string]: unknown;
}

export interface ListCandidatesResult {
  candidates: MiningCandidate[];
  total: number;
}

export interface ActOnCandidateInput {
  candidate_id: string;
  action: MiningCandidateAction;
  organization_id?: string;
  rationale?: string;
  /** Optional actor identity; platform may default from auth context. */
  actor?: string;
}

export interface ActOnCandidateResult {
  candidate_id?: string;
  action?: MiningCandidateAction | string;
  status?: MiningCandidateStatus | string;
  artifact_ref?: string;
  [key: string]: unknown;
}
