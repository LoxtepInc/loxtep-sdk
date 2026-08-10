import type { LoxtepClient } from '../../client/loxtep-client.js';
import { runCdlcReviewQueueCommand, runCdlcTransitionCommand } from './cdlc-cmd.js';

function mockClient(overrides: {
  organization_id?: string | null;
  transition_lifecycle?: jest.Mock;
  list_review_queue?: jest.Mock;
}): LoxtepClient {
  return {
    session: {
      get_current_user: async () =>
        overrides.organization_id
          ? { organization_id: overrides.organization_id }
          : {},
    },
    review: {
      cdlc: {
        transition_lifecycle:
          overrides.transition_lifecycle ??
          jest.fn(async () => ({
            artifact_ref: 'ontology_concept:c1',
            from: 'draft',
            to: 'in_review',
          })),
        list_review_queue:
          overrides.list_review_queue ??
          jest.fn(async () => ({ tasks: [], count: 0 })),
      },
    },
  } as unknown as LoxtepClient;
}

describe('cdlc-cmd', () => {
  it('transitions lifecycle with --from/--to', async () => {
    const transition_lifecycle = jest.fn(async () => ({
      artifact_ref: 'ontology_concept:c1',
      from: 'draft',
      to: 'in_review',
    }));
    const result = await runCdlcTransitionCommand(
      mockClient({ organization_id: 'org-1', transition_lifecycle }),
      'ontology_concept:c1',
      { from: 'draft', to: 'in_review', actor: 'u1', owner: 'bob' }
    );
    expect(result.exitCode).toBe(0);
    expect(transition_lifecycle).toHaveBeenCalledWith({
      artifact_ref: 'ontology_concept:c1',
      current_state: 'draft',
      target_state: 'in_review',
      organization_id: 'org-1',
      actor: 'u1',
      owner: 'bob',
    });
    expect(result.stdout[0]).toContain('in_review');
  });

  it('rejects missing --from/--to', async () => {
    const result = await runCdlcTransitionCommand(
      mockClient({ organization_id: 'org-1' }),
      'ontology_concept:c1',
      {}
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('--from');
  });

  it('rejects invalid lifecycle states', async () => {
    const result = await runCdlcTransitionCommand(
      mockClient({ organization_id: 'org-1' }),
      'ontology_concept:c1',
      { from: 'draft', to: 'shipped' }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Invalid lifecycle state');
  });

  it('lists steward review queue', async () => {
    const list_review_queue = jest.fn(async () => ({
      tasks: [{ id: 'rt1', artifact_ref: 'ontology_concept:c1', status: 'pending' }],
      count: 1,
    }));
    const result = await runCdlcReviewQueueCommand(
      mockClient({ organization_id: 'org-1', list_review_queue }),
      { domain_id: 'dom-1' }
    );
    expect(result.exitCode).toBe(0);
    expect(list_review_queue).toHaveBeenCalledWith({
      organization_id: 'org-1',
      domain_id: 'dom-1',
    });
    expect(result.stdout[0]).toContain('rt1');
  });

  it('fails when organization cannot be resolved', async () => {
    const result = await runCdlcReviewQueueCommand(mockClient({ organization_id: null }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('organization_id is required');
  });
});
