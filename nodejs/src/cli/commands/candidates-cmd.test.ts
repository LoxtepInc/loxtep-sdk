import type { LoxtepClient } from '../../client/loxtep-client.js';
import { runCandidatesActCommand, runCandidatesListCommand } from './candidates-cmd.js';

function mockClient(overrides: {
  organization_id?: string | null;
  list_candidates?: jest.Mock;
  act_on_candidate?: jest.Mock;
}): LoxtepClient {
  return {
    session: {
      get_current_user: async () =>
        overrides.organization_id
          ? { organization_id: overrides.organization_id }
          : {},
    },
    review: {
      mining: {
        list_candidates:
          overrides.list_candidates ??
          jest.fn(async () => ({ candidates: [], total: 0 })),
        act_on_candidate:
          overrides.act_on_candidate ??
          jest.fn(async () => ({ candidate_id: 'c1', action: 'approve', status: 'approved' })),
      },
    },
  } as unknown as LoxtepClient;
}

describe('candidates-cmd', () => {
  it('lists candidates with filters', async () => {
    const list_candidates = jest.fn(async () => ({
      candidates: [
        {
          id: 'cand-1',
          candidate_type: 'procedure',
          status: 'candidate',
          payload: {},
          provenance_refs: [],
          mining_run_id: 'run-1',
          organization_id: 'org-1',
        },
      ],
      total: 1,
    }));
    const result = await runCandidatesListCommand(
      mockClient({ organization_id: 'org-1', list_candidates }),
      {
        candidate_type: 'procedure',
        status: 'candidate',
        mining_run_id: 'run-1',
      }
    );
    expect(result.exitCode).toBe(0);
    expect(list_candidates).toHaveBeenCalledWith({
      organization_id: 'org-1',
      candidate_type: 'procedure',
      status: 'candidate',
      mining_run_id: 'run-1',
    });
    expect(result.stdout[0]).toContain('cand-1');
  });

  it('rejects invalid status filter with actionable error', async () => {
    const result = await runCandidatesListCommand(
      mockClient({ organization_id: 'org-1' }),
      { status: 'pending' }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain("Invalid status filter: 'pending'");
    expect(result.stderr[0]).toContain('candidate, approved, rejected');
  });

  it('rejects unknown --type with known types listed', async () => {
    const result = await runCandidatesListCommand(
      mockClient({ organization_id: 'org-1' }),
      { candidate_type: 'widget' }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain("Invalid --type: 'widget'");
    expect(result.stderr[0]).toContain('semantic_conflict');
  });

  it('acts on candidate with approve', async () => {
    const act_on_candidate = jest.fn(async () => ({
      candidate_id: 'cand-1',
      action: 'approve',
      status: 'approved',
      artifact_ref: 'procedure:p1',
    }));
    const result = await runCandidatesActCommand(
      mockClient({ organization_id: 'org-1', act_on_candidate }),
      'cand-1',
      { action: 'approve', actor: 'u1', rationale: 'looks good' }
    );
    expect(result.exitCode).toBe(0);
    expect(act_on_candidate).toHaveBeenCalledWith({
      candidate_id: 'cand-1',
      action: 'approve',
      organization_id: 'org-1',
      actor: 'u1',
      rationale: 'looks good',
    });
    expect(result.stdout[0]).toContain('procedure:p1');
  });

  it('requires --action with actionable guidance', async () => {
    const result = await runCandidatesActCommand(
      mockClient({ organization_id: 'org-1' }),
      'cand-1',
      {}
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('--action is required');
    expect(result.stderr[0]).toContain('approve');
    expect(result.stderr[0]).toContain('reject');
  });

  it('rejects invalid --action', async () => {
    const result = await runCandidatesActCommand(
      mockClient({ organization_id: 'org-1' }),
      'cand-1',
      { action: 'maybe' }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain("Invalid --action: 'maybe'");
  });

  it('surfaces API failures with candidate id and action', async () => {
    const act_on_candidate = jest.fn(async () => {
      throw new Error('candidate already resolved');
    });
    const result = await runCandidatesActCommand(
      mockClient({ organization_id: 'org-1', act_on_candidate }),
      'cand-9',
      { action: 'reject' }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain("Failed to act on candidate 'cand-9' (reject)");
    expect(result.stderr[0]).toContain('candidate already resolved');
  });

  it('fails when organization cannot be resolved', async () => {
    const result = await runCandidatesListCommand(mockClient({ organization_id: null }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('organization_id is required');
  });
});
