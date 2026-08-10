/**
 * Context mining API (MCP: loxtep_review — run_mining_pass, list_candidates, act_on_candidate).
 *
 * REST:
 *   POST /graph/organizations/{org}/mining/run
 *   GET  /graph/organizations/{org}/mining/candidates
 *   POST /graph/organizations/{org}/mining/candidates/{candidate_id}/act
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  ActOnCandidateInput,
  ActOnCandidateResult,
  ListCandidatesFilters,
  ListCandidatesResult,
  MiningApiDeps,
  MiningCandidate,
  RunMiningPassInput,
  RunMiningPassResult,
} from './mining-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function requireOrg(deps: MiningApiDeps, override?: string): string {
  const org = override ?? deps.organization_id;
  if (!org) {
    throw new Error(
      'organization_id is required for mining calls (set it on the client or pass it explicitly)'
    );
  }
  return org;
}

function orgBase(org: string): string {
  return `/graph/organizations/${encodeURIComponent(org)}/mining`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeCandidate(row: Record<string, unknown>): MiningCandidate {
  const provenance = row.provenance_refs ?? row.provenanceRefs;
  return {
    ...row,
    id: String(row.id ?? row.candidate_id ?? row.candidateId ?? ''),
    candidate_type: String(
      row.candidate_type ?? row.candidateType ?? 'unknown'
    ) as MiningCandidate['candidate_type'],
    status: String(row.status ?? 'candidate') as MiningCandidate['status'],
    payload: (asRecord(row.payload) ?? {}) as Record<string, unknown>,
    provenance_refs: Array.isArray(provenance)
      ? provenance.map(String)
      : [],
    mining_run_id:
      (row.mining_run_id as string | null | undefined) ??
      (row.miningRunId as string | null | undefined) ??
      null,
    organization_id: String(row.organization_id ?? row.organizationId ?? ''),
    created_at:
      (row.created_at as string | undefined) ??
      (row.createdAt as string | undefined),
    resolved_at:
      (row.resolved_at as string | null | undefined) ??
      (row.resolvedAt as string | null | undefined) ??
      null,
    resolved_by:
      (row.resolved_by as string | null | undefined) ??
      (row.resolvedBy as string | null | undefined) ??
      null,
  };
}

function normalizeCandidates(payload: unknown): ListCandidatesResult {
  const obj = asRecord(payload);
  let rows: unknown[] = [];
  if (Array.isArray(payload)) {
    rows = payload;
  } else if (obj) {
    if (Array.isArray(obj.candidates)) rows = obj.candidates;
    else if (Array.isArray(obj.items)) rows = obj.items;
  }
  const candidates = rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(normalizeCandidate);
  const total =
    typeof obj?.total === 'number' ? obj.total : candidates.length;
  return { candidates, total };
}

export interface MiningApi {
  run_mining_pass: (input?: RunMiningPassInput) => Promise<RunMiningPassResult>;
  list_candidates: (filters?: ListCandidatesFilters) => Promise<ListCandidatesResult>;
  act_on_candidate: (input: ActOnCandidateInput) => Promise<ActOnCandidateResult>;
}

export function createMiningApi(http: LoxtepHttpClient, deps: MiningApiDeps = {}): MiningApi {
  return {
    async run_mining_pass(input: RunMiningPassInput = {}): Promise<RunMiningPassResult> {
      const org = requireOrg(deps, input.organization_id);
      const path = `${orgBase(org)}/run`;
      const res = await http.post<unknown>(path, {
        signal_sources: input.signal_sources ?? null,
        scope_filters: input.scope_filters ?? null,
      });
      const payload = unwrapData<Record<string, unknown>>(res) ?? {};
      return payload as RunMiningPassResult;
    },

    async list_candidates(filters: ListCandidatesFilters = {}): Promise<ListCandidatesResult> {
      const org = requireOrg(deps, filters.organization_id);
      const search = new URLSearchParams();
      if (filters.candidate_type) search.set('candidate_type', filters.candidate_type);
      if (filters.status) search.set('status', filters.status);
      if (filters.mining_run_id) search.set('mining_run_id', filters.mining_run_id);
      const qs = search.toString() ? `?${search.toString()}` : '';
      const res = await http.get<unknown>(`${orgBase(org)}/candidates${qs}`);
      return normalizeCandidates(unwrapData(res));
    },

    async act_on_candidate(input: ActOnCandidateInput): Promise<ActOnCandidateResult> {
      const org = requireOrg(deps, input.organization_id);
      if (!input.candidate_id) {
        throw new Error('candidate_id is required for act_on_candidate');
      }
      const path = `${orgBase(org)}/candidates/${encodeURIComponent(input.candidate_id)}/act`;
      const res = await http.post<unknown>(path, {
        action: input.action,
        ...(input.rationale != null ? { rationale: input.rationale } : {}),
        ...(input.actor != null ? { actor: input.actor } : {}),
      });
      const payload = unwrapData<Record<string, unknown>>(res) ?? {};
      return {
        candidate_id: (payload.candidate_id as string | undefined) ?? input.candidate_id,
        action: (payload.action as string | undefined) ?? input.action,
        ...payload,
      };
    },
  };
}
