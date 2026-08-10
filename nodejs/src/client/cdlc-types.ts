/**
 * CDLC (Context Development Lifecycle) API types.
 * MCP ops under loxtep_review: get_artifact_lifecycle, transition_lifecycle,
 * propagate_change, list_propagation_lineage, list_context_dependencies.
 * Steward queue (REST; not a separate MCP tool): list_review_queue.
 *
 * REST (graph):
 *   GET  /graph/organizations/{org}/cdlc/artifacts/{artifact_ref}
 *   POST /graph/organizations/{org}/cdlc/artifacts/{artifact_ref}/transition
 *   POST /graph/organizations/{org}/cdlc/propagate
 *   GET  /graph/organizations/{org}/cdlc/propagation-lineage
 *   GET  /graph/organizations/{org}/cdlc/dependencies
 *   GET  /graph/organizations/{org}/cdlc/review-queue
 */

/** Artifact ref format: `artifact_type:id` (e.g. "thesaurus_term:term_123"). */
export type ArtifactRef = string;

export type LifecycleState = 'draft' | 'in_review' | 'approved' | 'deployed' | 'retired';

export type ChangePropagationPolicy =
  | 'auto_propagate'
  | 'queue_review'
  | 'freeze_until_certified';

export type DependencyType =
  | 'defines'
  | 'uses_term'
  | 'derived_from'
  | 'references'
  | 'feeds';

export interface CdlcApiDeps {
  /** Default organization for CDLC calls; overridable per call. */
  organization_id?: string;
}

export interface GetArtifactLifecycleInput {
  artifact_ref: ArtifactRef;
  organization_id?: string;
}

export interface ArtifactLifecycle {
  artifact_ref: ArtifactRef;
  lifecycle_state: LifecycleState | string;
  change_propagation_policy: ChangePropagationPolicy | string | null;
  owner: string | null;
  allowed_transitions: readonly string[];
}

export interface TransitionLifecycleInput {
  artifact_ref: ArtifactRef;
  current_state: LifecycleState;
  target_state: LifecycleState;
  organization_id?: string;
  actor?: string;
  /** Optional owner to set/update on the artifact ("My Context"). */
  owner?: string;
}

export interface LifecycleTransitionResult {
  artifact_ref: ArtifactRef;
  from: string;
  to: string;
  actor?: string;
  transitioned_at?: string;
  allowed_transitions?: readonly string[];
  persisted?: boolean;
  [key: string]: unknown;
}

export interface PropagateChangeInput {
  artifact_ref: ArtifactRef;
  new_version: string;
  organization_id?: string;
  previous_version?: string;
  change_propagation_policy?: ChangePropagationPolicy | null;
  actor?: string;
}

export interface PropagateChangeAction {
  artifact_ref?: ArtifactRef;
  action?: string;
  [key: string]: unknown;
}

export interface PropagateChangeResult {
  source_artifact_ref?: ArtifactRef;
  artifact_ref?: ArtifactRef;
  new_version?: string;
  previous_version?: string | null;
  resolved_policy?: ChangePropagationPolicy | string;
  actions?: PropagateChangeAction[];
  actor?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface ListPropagationLineageFilters {
  organization_id?: string;
  source_artifact_ref?: ArtifactRef;
  action_taken?: ChangePropagationPolicy;
  actor?: string;
  from_date?: string;
  to_date?: string;
}

export interface PropagationLineageRecord {
  id?: string;
  source_artifact_ref: ArtifactRef;
  version_before?: string | null;
  version_after?: string;
  dependents_affected?: ArtifactRef[] | string[];
  action_taken?: ChangePropagationPolicy | string;
  actor?: string;
  organization_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface PropagationLineageListResult {
  records: PropagationLineageRecord[];
  count: number;
}

export interface ListContextDependenciesFilters {
  organization_id?: string;
  from_artifact_ref?: ArtifactRef;
  to_artifact_ref?: ArtifactRef;
  dependency_type?: DependencyType;
}

export interface ContextDependency {
  id: string;
  from_artifact_ref: ArtifactRef;
  to_artifact_ref: ArtifactRef;
  dependency_type: DependencyType | string;
  organization_id: string;
  created_at: string;
}

export interface ContextDependenciesListResult {
  dependencies: ContextDependency[];
  count: number;
}

export type ReviewTaskStatus = 'pending' | 'approved' | 'rejected';

export interface ListReviewQueueFilters {
  organization_id?: string;
  /** Optional domain filter (platform may ignore until query params are wired). */
  domain_id?: string;
}

/** Pending steward review task created by `queue_review` propagation. */
export interface ReviewTask {
  id: string;
  artifact_ref: ArtifactRef;
  artifact_name: string;
  artifact_type: string;
  source_artifact_ref: ArtifactRef;
  source_artifact_name: string;
  version_before: string | null;
  version_after: string;
  actor: string;
  status: ReviewTaskStatus | string;
  created_at: string;
  owner: string | null;
  rejection_reason?: string | null;
  [key: string]: unknown;
}

export interface ReviewQueueListResult {
  tasks: ReviewTask[];
  count: number;
}
