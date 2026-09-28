import { createProposalsApi } from './proposals.js';
import type { LoxtepHttpClient } from '../http/client.js';

const PROPOSAL = {
  semantic_proposal_id: 'p1',
  organization_id: 'org1',
  proposal_type: 'vocabulary_term',
  proposal_payload: { canonical_key: 'email' },
  disposition: 'pending',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('createProposalsApi', () => {
  it('list GETs /semantic-layer/semantic-proposals with filters', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: {
            items: [PROPOSAL],
            pagination: {
              page: 1,
              page_size: 20,
              total: 1,
              total_pages: 1,
              has_next: false,
              has_prev: false,
            },
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProposalsApi(http);
    const result = await api.list({ disposition: 'pending', page: 1 });
    expect(capturedPath).toBe(
      '/semantic-layer/semantic-proposals?page=1&disposition=pending'
    );
    expect(result.items).toEqual([PROPOSAL]);
    expect(result.pagination.total).toBe(1);
  });

  it('accept PUTs disposition accepted', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      put: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: { semantic_proposal_id: 'p1', disposition: 'accepted' },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProposalsApi(http);
    const result = await api.accept('p1', { resolution_note: 'looks good' });
    expect(capturedPath).toBe('/semantic-layer/semantic-proposals/p1');
    expect(capturedBody).toEqual({
      disposition: 'accepted',
      resolution_note: 'looks good',
    });
    expect(result.disposition).toBe('accepted');
  });

  it('reject PUTs disposition rejected', async () => {
    let capturedBody: unknown = null;
    const http = {
      put: async (_path: string, body: unknown) => {
        capturedBody = body;
        return {
          success: true as const,
          data: { semantic_proposal_id: 'p1', disposition: 'rejected' },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProposalsApi(http);
    await api.reject('p1');
    expect(capturedBody).toEqual({ disposition: 'rejected' });
  });

  it('accept_batch resolves each id and continues on failure', async () => {
    const calls: string[] = [];
    const http = {
      put: async (path: string) => {
        calls.push(path);
        if (path.endsWith('/p2')) throw new Error('boom');
        return {
          success: true as const,
          data: {
            semantic_proposal_id: path.split('/').pop(),
            disposition: 'accepted',
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProposalsApi(http);
    const result = await api.accept_batch({
      semantic_proposal_ids: ['p1', 'p2', 'p3'],
    });

    expect(calls).toHaveLength(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results[1]).toMatchObject({ semantic_proposal_id: 'p2', ok: false });
  });

  it('reject_batch uses rejected disposition', async () => {
    const bodies: unknown[] = [];
    const http = {
      put: async (_path: string, body: unknown) => {
        bodies.push(body);
        return {
          success: true as const,
          data: { semantic_proposal_id: 'p1', disposition: 'rejected' },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProposalsApi(http);
    await api.reject_batch({ semantic_proposal_ids: ['p1'] });
    expect(bodies[0]).toEqual({ disposition: 'rejected' });
  });
});
