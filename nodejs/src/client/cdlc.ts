/**
 * CDLC (Context Development Lifecycle) API — lifecycle get/transition,
 * change propagation, lineage, context dependency edges, and steward review queue.
 * MCP: loxtep_review CDLC ops (get_artifact_lifecycle, transition_lifecycle,
 * propagate_change, list_propagation_lineage, list_context_dependencies).
 * REST steward path: list_review_queue (GET .../cdlc/review-queue).
 * list_cdlc_review_queue is the same GET. bridge_semantics is not org-scoped.
 *
 *   GET  /graph/organizations/{org}/cdlc/artifacts
 *   GET  /graph/organizations/{org}/cdlc/artifacts/{artifact_ref}
 *   POST /graph/organizations/{org}/cdlc/artifacts/{artifact_ref}/transition
 *   POST /graph/organizations/{org}/cdlc/artifacts/submit-for-review
 *   POST /graph/organizations/{org}/cdlc/propagate
 *   GET  /graph/organizations/{org}/cdlc/propagation-lineage
 *   GET  /graph/organizations/{org}/cdlc/dependencies
 *   GET  /graph/organizations/{org}/cdlc/review-queue
 *   GET  /graph/organizations/{org}/cdlc/identity-clusters
 *   POST /graph/organizations/{org}/cdlc/review-queue/{task_id}/approve
 *   POST /graph/cdlc/bridge-semantics
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  ApproveReviewInput,
  ArtifactLifecycle,
  ArtifactListResult,
  BridgeSemanticsInput,
  CdlcApiDeps,
  CdlcArtifactSummary,
  ContextDependenciesListResult,
  GetArtifactLifecycleInput,
  IdentityClusterListResult,
  LifecycleTransitionResult,
  ListArtifactsFilters,
  ListContextDependenciesFilters,
  ListPropagationLineageFilters,
  ListReviewQueueFilters,
  PropagateChangeInput,
  PropagateChangeResult,
  PropagationLineageListResult,
  PropagationLineageRecord,
  ReviewQueueListResult,
  ReviewTask,
  SubmitForReviewInput,
  SubmitForReviewResult,
  TransitionLifecycleInput,
} from './cdlc-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function requireOrg(deps: CdlcApiDeps, override?: string): string {
  const org = override ?? deps.organization_id;
  if (!org) {
    throw new Error(
      'organization_id is required for CDLC calls (set it on the client or pass it explicitly)'
    );
  }
  return org;
}

function orgBase(org: string): string {
  return `/graph/organizations/${encodeURIComponent(org)}/cdlc`;
}

function normalizeLifecycle(payload: Record<string, unknown>, artifact_ref: string): ArtifactLifecycle {
  return {
    artifact_ref: (payload.artifact_ref as string) ?? artifact_ref,
    lifecycle_state: (payload.lifecycle_state as string) ?? 'deployed',
    change_propagation_policy:
      (payload.change_propagation_policy as string | null | undefined) ?? 'queue_review',
    owner: (payload.owner as string | null | undefined) ?? null,
    allowed_transitions: Array.isArray(payload.allowed_transitions)
      ? (payload.allowed_transitions as string[])
      : [],
  };
}

function normalizeLineage(payload: unknown): PropagationLineageListResult {
  if (Array.isArray(payload)) {
    const records = payload as PropagationLineageRecord[];
    return { records, count: records.length };
  }
  const obj = (payload ?? {}) as {
    records?: PropagationLineageRecord[];
    count?: number;
  };
  const records = Array.isArray(obj.records) ? obj.records : [];
  return { records, count: obj.count ?? records.length };
}

function normalizeDependencies(payload: unknown): ContextDependenciesListResult {
  const obj = (payload ?? {}) as ContextDependenciesListResult;
  if (Array.isArray(payload)) {
    const dependencies = payload as ContextDependenciesListResult['dependencies'];
    return { dependencies, count: dependencies.length };
  }
  const dependencies = Array.isArray(obj.dependencies) ? obj.dependencies : [];
  return { dependencies, count: obj.count ?? dependencies.length };
}

function normalizeReviewTask(row: Record<string, unknown>): ReviewTask {
  return {
    id: String(row.id ?? row.task_id ?? ''),
    artifact_ref: String(row.artifact_ref ?? row.artifactRef ?? ''),
    artifact_name: String(row.artifact_name ?? row.artifactName ?? ''),
    artifact_type: String(row.artifact_type ?? row.artifactType ?? 'unknown'),
    source_artifact_ref: String(row.source_artifact_ref ?? row.sourceArtifactRef ?? ''),
    source_artifact_name: String(row.source_artifact_name ?? row.sourceArtifactName ?? ''),
    version_before: (row.version_before ?? row.versionBefore ?? null) as string | null,
    version_after: String(row.version_after ?? row.versionAfter ?? ''),
    actor: String(row.actor ?? ''),
    status: String(row.status ?? 'pending'),
    created_at: String(row.created_at ?? row.createdAt ?? ''),
    owner: (row.owner as string | null | undefined) ?? null,
    rejection_reason: (row.rejection_reason ??
      row.rejectionReason ??
      null) as string | null,
  };
}

function normalizeReviewQueue(payload: unknown): ReviewQueueListResult {
  let rows: unknown[] = [];
  if (Array.isArray(payload)) {
    rows = payload;
  } else if (payload && typeof payload === 'object') {
    const obj = payload as {
      tasks?: unknown[];
      items?: unknown[];
      count?: number;
    };
    if (Array.isArray(obj.tasks)) rows = obj.tasks;
    else if (Array.isArray(obj.items)) rows = obj.items;
  }
  const tasks = rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(normalizeReviewTask);
  return { tasks, count: tasks.length };
}

function normalizeArtifacts(payload: unknown): ArtifactListResult {
  if (Array.isArray(payload)) {
    const artifacts = payload as CdlcArtifactSummary[];
    return { artifacts, count: artifacts.length };
  }
  const obj = (payload ?? {}) as {
    artifacts?: CdlcArtifactSummary[];
    items?: CdlcArtifactSummary[];
    count?: number;
  };
  const artifacts = Array.isArray(obj.artifacts)
    ? obj.artifacts
    : Array.isArray(obj.items)
      ? obj.items
      : [];
  return { artifacts, count: obj.count ?? artifacts.length };
}

function normalizeClusters(payload: unknown): IdentityClusterListResult {
  if (Array.isArray(payload)) {
    const clusters = payload as Array<Record<string, unknown>>;
    return { clusters, count: clusters.length };
  }
  const obj = (payload ?? {}) as {
    clusters?: Array<Record<string, unknown>>;
    items?: Array<Record<string, unknown>>;
    count?: number;
  };
  const clusters = Array.isArray(obj.clusters)
    ? obj.clusters
    : Array.isArray(obj.items)
      ? obj.items
      : [];
  return { clusters, count: obj.count ?? clusters.length };
}

export interface CdlcApi {
  get_artifact_lifecycle: (input: GetArtifactLifecycleInput) => Promise<ArtifactLifecycle>;
  transition_lifecycle: (input: TransitionLifecycleInput) => Promise<LifecycleTransitionResult>;
  propagate_change: (input: PropagateChangeInput) => Promise<PropagateChangeResult>;
  list_propagation_lineage: (
    filters?: ListPropagationLineageFilters
  ) => Promise<PropagationLineageListResult>;
  list_context_dependencies: (
    filters?: ListContextDependenciesFilters
  ) => Promise<ContextDependenciesListResult>;
  /** Steward review queue (pending `in_review` / queue_review tasks). */
  list_review_queue: (filters?: ListReviewQueueFilters) => Promise<ReviewQueueListResult>;
  /** MCP name for `list_review_queue` (same GET). */
  list_cdlc_review_queue: (filters?: ListReviewQueueFilters) => Promise<ReviewQueueListResult>;
  list_artifacts: (filters?: ListArtifactsFilters) => Promise<ArtifactListResult>;
  submit_for_review: (input: SubmitForReviewInput) => Promise<SubmitForReviewResult>;
  list_identity_clusters: (filters?: { organization_id?: string }) => Promise<IdentityClusterListResult>;
  approve_review: (input: ApproveReviewInput) => Promise<unknown>;
  /** POST /graph/cdlc/bridge-semantics — not under /organizations/{org}/cdlc. */
  bridge_semantics: (input: BridgeSemanticsInput) => Promise<unknown>;
}

export function createCdlcApi(http: LoxtepHttpClient, deps: CdlcApiDeps = {}): CdlcApi {
  const api: CdlcApi = {
    async get_artifact_lifecycle(input: GetArtifactLifecycleInput): Promise<ArtifactLifecycle> {
      const org = requireOrg(deps, input.organization_id);
      const path = `${orgBase(org)}/artifacts/${encodeURIComponent(input.artifact_ref)}`;
      const res = await http.get<unknown>(path);
      const payload = unwrapData<Record<string, unknown>>(res);
      return normalizeLifecycle(payload ?? {}, input.artifact_ref);
    },

    async transition_lifecycle(input: TransitionLifecycleInput): Promise<LifecycleTransitionResult> {
      const org = requireOrg(deps, input.organization_id);
      const path = `${orgBase(org)}/artifacts/${encodeURIComponent(input.artifact_ref)}/transition`;
      const res = await http.post<unknown>(path, {
        current_state: input.current_state,
        target_state: input.target_state,
        ...(input.actor ? { actor: input.actor } : {}),
        ...(input.owner ? { owner: input.owner } : {}),
      });
      const payload = unwrapData<Record<string, unknown>>(res) ?? {};
      return {
        artifact_ref: (payload.artifact_ref as string) ?? input.artifact_ref,
        from: (payload.from as string) ?? input.current_state,
        to: (payload.to as string) ?? input.target_state,
        ...payload,
      };
    },

    async propagate_change(input: PropagateChangeInput): Promise<PropagateChangeResult> {
      const org = requireOrg(deps, input.organization_id);
      const path = `${orgBase(org)}/propagate`;
      const res = await http.post<unknown>(path, {
        artifact_ref: input.artifact_ref,
        new_version: input.new_version,
        previous_version: input.previous_version ?? null,
        change_propagation_policy: input.change_propagation_policy ?? null,
        ...(input.actor ? { actor: input.actor } : {}),
      });
      return unwrapData<PropagateChangeResult>(res) ?? {};
    },

    async list_propagation_lineage(
      filters: ListPropagationLineageFilters = {}
    ): Promise<PropagationLineageListResult> {
      const org = requireOrg(deps, filters.organization_id);
      const search = new URLSearchParams();
      if (filters.source_artifact_ref) {
        search.set('source_artifact_ref', filters.source_artifact_ref);
      }
      if (filters.action_taken) search.set('action_taken', filters.action_taken);
      if (filters.actor) search.set('actor', filters.actor);
      if (filters.from_date) search.set('from_date', filters.from_date);
      if (filters.to_date) search.set('to_date', filters.to_date);
      const qs = search.toString() ? `?${search.toString()}` : '';
      const res = await http.get<unknown>(`${orgBase(org)}/propagation-lineage${qs}`);
      return normalizeLineage(unwrapData(res));
    },

    async list_context_dependencies(
      filters: ListContextDependenciesFilters = {}
    ): Promise<ContextDependenciesListResult> {
      const org = requireOrg(deps, filters.organization_id);
      const search = new URLSearchParams();
      if (filters.from_artifact_ref) {
        search.set('from_artifact_ref', filters.from_artifact_ref);
      }
      if (filters.to_artifact_ref) search.set('to_artifact_ref', filters.to_artifact_ref);
      if (filters.dependency_type) search.set('dependency_type', filters.dependency_type);
      const qs = search.toString() ? `?${search.toString()}` : '';
      const res = await http.get<unknown>(`${orgBase(org)}/dependencies${qs}`);
      return normalizeDependencies(unwrapData(res));
    },

    async list_review_queue(
      filters: ListReviewQueueFilters = {}
    ): Promise<ReviewQueueListResult> {
      const org = requireOrg(deps, filters.organization_id);
      const search = new URLSearchParams();
      if (filters.domain_id) search.set('domain_id', filters.domain_id);
      const qs = search.toString() ? `?${search.toString()}` : '';
      const res = await http.get<unknown>(`${orgBase(org)}/review-queue${qs}`);
      return normalizeReviewQueue(unwrapData(res));
    },

    list_cdlc_review_queue(filters?: ListReviewQueueFilters): Promise<ReviewQueueListResult> {
      return api.list_review_queue(filters);
    },

    async list_artifacts(filters: ListArtifactsFilters = {}): Promise<ArtifactListResult> {
      const org = requireOrg(deps, filters.organization_id);
      const search = new URLSearchParams();
      if (filters.lifecycle_state) search.set('lifecycle_state', filters.lifecycle_state);
      if (filters.scope) search.set('scope', filters.scope);
      if (filters.artifact_type) search.set('artifact_type', filters.artifact_type);
      if (filters.owner) search.set('owner', filters.owner);
      if (filters.domain_id) search.set('domain_id', filters.domain_id);
      const qs = search.toString() ? `?${search.toString()}` : '';
      const res = await http.get<unknown>(`${orgBase(org)}/artifacts${qs}`);
      return normalizeArtifacts(unwrapData(res));
    },

    async submit_for_review(input: SubmitForReviewInput): Promise<SubmitForReviewResult> {
      const org = requireOrg(deps, input.organization_id);
      if (!input.artifact_refs?.length) {
        throw new Error('artifact_refs is required');
      }
      const res = await http.post<unknown>(`${orgBase(org)}/artifacts/submit-for-review`, {
        artifact_refs: input.artifact_refs,
      });
      return unwrapData<SubmitForReviewResult>(res);
    },

    async list_identity_clusters(
      filters: { organization_id?: string } = {}
    ): Promise<IdentityClusterListResult> {
      const org = requireOrg(deps, filters.organization_id);
      const res = await http.get<unknown>(`${orgBase(org)}/identity-clusters`);
      return normalizeClusters(unwrapData(res));
    },

    async approve_review(input: ApproveReviewInput): Promise<unknown> {
      if (!input.task_id) throw new Error('task_id is required');
      const org = requireOrg(deps, input.organization_id);
      const path = `${orgBase(org)}/review-queue/${encodeURIComponent(input.task_id)}/approve`;
      const res = await http.post<unknown>(path, {});
      return unwrapData(res);
    },

    async bridge_semantics(input: BridgeSemanticsInput): Promise<unknown> {
      if (!input.data_product_id) throw new Error('data_product_id is required');
      const res = await http.post<unknown>('/graph/cdlc/bridge-semantics', {
        data_product_id: input.data_product_id,
      });
      return unwrapData(res);
    },
  };
  return api;
}
