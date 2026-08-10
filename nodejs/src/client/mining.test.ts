import { createMiningApi } from './mining.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createMiningApi', () => {
  it('run_mining_pass POSTs signal_sources and scope_filters to .../mining/run', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: {
            mining_run_id: 'run1',
            candidates_created: 2,
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createMiningApi(http, { organization_id: 'org1' });
    const result = await api.run_mining_pass({
      signal_sources: ['semantic_definitions', 'decision_traces'],
      scope_filters: { entity_types: ['order'], from_date: '2026-01-01' },
    });

    expect(capturedPath).toBe('/graph/organizations/org1/mining/run');
    expect(capturedBody).toEqual({
      signal_sources: ['semantic_definitions', 'decision_traces'],
      scope_filters: { entity_types: ['order'], from_date: '2026-01-01' },
    });
    expect(result.mining_run_id).toBe('run1');
    expect(result.candidates_created).toBe(2);
  });

  it('run_mining_pass sends null bodies when optional filters omitted', async () => {
    let capturedBody: unknown = null;
    const http = {
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return { success: true as const, data: { mining_run_id: 'run2' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createMiningApi(http, { organization_id: 'org1' });
    await api.run_mining_pass();

    expect(capturedBody).toEqual({
      signal_sources: null,
      scope_filters: null,
    });
  });

  it('list_candidates builds query string and normalizes array payloads', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: {
            candidates: [
              {
                id: 'c1',
                candidate_type: 'procedure',
                status: 'candidate',
                payload: { name: 'refund' },
                provenance_refs: ['trace:1'],
                mining_run_id: 'run1',
                organization_id: 'org1',
                created_at: '2026-08-10T00:00:00Z',
              },
            ],
            total: 1,
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createMiningApi(http, { organization_id: 'org1' });
    const result = await api.list_candidates({
      candidate_type: 'procedure',
      status: 'candidate',
      mining_run_id: 'run1',
    });

    expect(capturedPath).toBe(
      '/graph/organizations/org1/mining/candidates?candidate_type=procedure&status=candidate&mining_run_id=run1'
    );
    expect(result.total).toBe(1);
    expect(result.candidates[0]?.id).toBe('c1');
    expect(result.candidates[0]?.candidate_type).toBe('procedure');
    expect(result.candidates[0]?.provenance_refs).toEqual(['trace:1']);
  });

  it('list_candidates normalizes bare array responses', async () => {
    const http = {
      get: async () => ({
        success: true as const,
        data: [
          {
            id: 'c2',
            candidateType: 'semantic_conflict',
            status: 'candidate',
            payload: {},
            provenanceRefs: ['def:a'],
            miningRunId: 'run3',
            organizationId: 'org1',
          },
        ],
      }),
    } as unknown as LoxtepHttpClient;

    const api = createMiningApi(http, { organization_id: 'org1' });
    const result = await api.list_candidates();

    expect(result.total).toBe(1);
    expect(result.candidates[0]?.candidate_type).toBe('semantic_conflict');
    expect(result.candidates[0]?.mining_run_id).toBe('run3');
    expect(result.candidates[0]?.provenance_refs).toEqual(['def:a']);
  });

  it('act_on_candidate POSTs action body to .../candidates/{id}/act', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: {
            candidate_id: 'c1',
            action: 'approve',
            status: 'approved',
            artifact_ref: 'procedure:p1',
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createMiningApi(http, { organization_id: 'org1' });
    const result = await api.act_on_candidate({
      candidate_id: 'c1',
      action: 'approve',
      rationale: 'looks good',
      actor: 'u1',
    });

    expect(capturedPath).toBe('/graph/organizations/org1/mining/candidates/c1/act');
    expect(capturedBody).toEqual({
      action: 'approve',
      rationale: 'looks good',
      actor: 'u1',
    });
    expect(result.status).toBe('approved');
    expect(result.artifact_ref).toBe('procedure:p1');
  });

  it('requires organization_id when not configured', async () => {
    const http = {
      post: async () => ({ success: true as const, data: {} }),
    } as unknown as LoxtepHttpClient;
    const api = createMiningApi(http);

    await expect(api.run_mining_pass()).rejects.toThrow('organization_id is required');
  });

  it('requires candidate_id for act_on_candidate', async () => {
    const http = {
      post: async () => ({ success: true as const, data: {} }),
    } as unknown as LoxtepHttpClient;
    const api = createMiningApi(http, { organization_id: 'org1' });

    await expect(
      api.act_on_candidate({ candidate_id: '', action: 'reject' })
    ).rejects.toThrow('candidate_id is required');
  });
});
