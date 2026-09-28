/**
 * Semantic proposals API (Phase 2).
 * Agent review queue parity with Meaning UI.
 *
 *   GET /semantic-layer/semantic-proposals
 *   PUT /semantic-layer/semantic-proposals/{semantic_proposal_id}
 *
 * Batch accept/reject fan out to the single-id PUT (no dedicated batch REST yet).
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  BatchResolveSemanticProposalsInput,
  BatchResolveSemanticProposalsResult,
  ListSemanticProposalsFilters,
  ListSemanticProposalsResult,
  ResolveSemanticProposalInput,
  ResolveSemanticProposalResult,
  SemanticProposal,
  SemanticProposalsPagination,
} from './proposals-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const PROPOSALS_BASE = '/semantic-layer/semantic-proposals';

function defaultPagination(total: number): SemanticProposalsPagination {
  return {
    page: 1,
    page_size: total,
    total,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  };
}

function normalizeList(res: unknown): ListSemanticProposalsResult {
  const data = unwrapData<unknown>(res);
  if (Array.isArray(data)) {
    return { items: data as SemanticProposal[], pagination: defaultPagination(data.length) };
  }
  const rec = asRecord(data);
  if (!rec) {
    return { items: [], pagination: defaultPagination(0) };
  }
  const items = Array.isArray(rec.items)
    ? (rec.items as SemanticProposal[])
    : Array.isArray(rec.proposals)
      ? (rec.proposals as SemanticProposal[])
      : [];
  const paginationRaw = asRecord(rec.pagination) ?? {};
  const page = typeof paginationRaw.page === 'number' ? paginationRaw.page : 1;
  const page_size =
    typeof paginationRaw.page_size === 'number' ? paginationRaw.page_size : items.length;
  const total = typeof paginationRaw.total === 'number' ? paginationRaw.total : items.length;
  const total_pages =
    typeof paginationRaw.total_pages === 'number'
      ? paginationRaw.total_pages
      : Math.max(1, Math.ceil(total / Math.max(page_size, 1)));
  return {
    items,
    pagination: {
      page,
      page_size,
      total,
      total_pages,
      has_next:
        typeof paginationRaw.has_next === 'boolean'
          ? paginationRaw.has_next
          : page < total_pages,
      has_prev:
        typeof paginationRaw.has_prev === 'boolean' ? paginationRaw.has_prev : page > 1,
    },
  };
}

async function resolveOne(
  http: LoxtepHttpClient,
  semantic_proposal_id: string,
  input: ResolveSemanticProposalInput
): Promise<ResolveSemanticProposalResult> {
  if (!semantic_proposal_id) throw new Error('semantic_proposal_id is required');
  const body: Record<string, unknown> = { disposition: input.disposition };
  if (input.resolution_note !== undefined) body.resolution_note = input.resolution_note;
  const res = await http.put(
    `${PROPOSALS_BASE}/${encodeURIComponent(semantic_proposal_id)}`,
    body
  );
  return unwrapData<ResolveSemanticProposalResult>(res);
}

async function resolveBatch(
  http: LoxtepHttpClient,
  input: BatchResolveSemanticProposalsInput
): Promise<BatchResolveSemanticProposalsResult> {
  const ids = input.semantic_proposal_ids ?? [];
  const results: BatchResolveSemanticProposalsResult['results'] = [];
  let succeeded = 0;
  let failed = 0;
  for (const semantic_proposal_id of ids) {
    try {
      const one = await resolveOne(http, semantic_proposal_id, {
        disposition: input.disposition,
        resolution_note: input.resolution_note,
      });
      results.push({
        semantic_proposal_id: one.semantic_proposal_id,
        disposition: one.disposition,
        ok: true,
      });
      succeeded += 1;
    } catch (err) {
      failed += 1;
      results.push({
        semantic_proposal_id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { results, succeeded, failed };
}

export function createProposalsApi(http: LoxtepHttpClient): {
  list: (filters?: ListSemanticProposalsFilters) => Promise<ListSemanticProposalsResult>;
  accept: (
    semantic_proposal_id: string,
    options?: { resolution_note?: string }
  ) => Promise<ResolveSemanticProposalResult>;
  reject: (
    semantic_proposal_id: string,
    options?: { resolution_note?: string }
  ) => Promise<ResolveSemanticProposalResult>;
  accept_batch: (
    input: Omit<BatchResolveSemanticProposalsInput, 'disposition'>
  ) => Promise<BatchResolveSemanticProposalsResult>;
  reject_batch: (
    input: Omit<BatchResolveSemanticProposalsInput, 'disposition'>
  ) => Promise<BatchResolveSemanticProposalsResult>;
} {
  return {
    async list(filters: ListSemanticProposalsFilters = {}): Promise<ListSemanticProposalsResult> {
      const search = new URLSearchParams();
      if (filters.page != null) search.set('page', String(filters.page));
      if (filters.page_size != null) search.set('page_size', String(filters.page_size));
      if (filters.proposal_type) search.set('proposal_type', filters.proposal_type);
      if (filters.disposition) search.set('disposition', filters.disposition);
      if (filters.data_product_id) search.set('data_product_id', filters.data_product_id);
      const qs = search.toString();
      const res = await http.get(`${PROPOSALS_BASE}${qs ? `?${qs}` : ''}`);
      return normalizeList(res);
    },

    async accept(
      semantic_proposal_id: string,
      options?: { resolution_note?: string }
    ): Promise<ResolveSemanticProposalResult> {
      return resolveOne(http, semantic_proposal_id, {
        disposition: 'accepted',
        resolution_note: options?.resolution_note,
      });
    },

    async reject(
      semantic_proposal_id: string,
      options?: { resolution_note?: string }
    ): Promise<ResolveSemanticProposalResult> {
      return resolveOne(http, semantic_proposal_id, {
        disposition: 'rejected',
        resolution_note: options?.resolution_note,
      });
    },

    async accept_batch(
      input: Omit<BatchResolveSemanticProposalsInput, 'disposition'>
    ): Promise<BatchResolveSemanticProposalsResult> {
      return resolveBatch(http, { ...input, disposition: 'accepted' });
    },

    async reject_batch(
      input: Omit<BatchResolveSemanticProposalsInput, 'disposition'>
    ): Promise<BatchResolveSemanticProposalsResult> {
      return resolveBatch(http, { ...input, disposition: 'rejected' });
    },
  };
}

export type ProposalsApi = ReturnType<typeof createProposalsApi>;
