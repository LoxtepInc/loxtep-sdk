import type { LoxtepClient } from '../../client/loxtep-client.js';
import {
  buildApprovalAddOps,
  directDownstreamEntityIds,
  runApprovalAddCommand,
} from './approval-add-cmd.js';

const WORKFLOW_ID = '00000000-0000-4000-8000-000000000201';
const AFTER_ID = '00000000-0000-4000-8000-000000000202';
const CHILD_ID = '00000000-0000-4000-8000-000000000203';
const PROJECT_ID = '00000000-0000-4000-8000-000000000101';

describe('directDownstreamEntityIds', () => {
  it('reads upstream ids from a node record', () => {
    const ids = directDownstreamEntityIds(
      {
        nodes: {
          [CHILD_ID]: { entity_id: CHILD_ID, upstream_entity_id: AFTER_ID },
          other: { entity_id: '00000000-0000-4000-8000-000000000204', data: { upstreamEntityId: 'nope' } },
        },
      },
      AFTER_ID,
    );
    expect(ids).toEqual([CHILD_ID]);
  });
});

describe('buildApprovalAddOps', () => {
  it('splices direct children onto the approved path', () => {
    const ops = buildApprovalAddOps({
      workflowId: WORKFLOW_ID,
      after: AFTER_ID,
      name: 'Approval',
      channel: 'inbox',
      timeoutHours: 24,
      downstreamEntityIds: [CHILD_ID],
      upstreamEntityType: 'transformations',
      projectId: PROJECT_ID,
      approvalNodeId: '00000000-0000-4000-8000-000000000601',
      now: '2026-11-03T00:00:00.000Z',
    });
    expect(ops.map((op) => op.op)).toEqual(['add_node', 'connect_nodes', 'connect_nodes_labeled']);
    expect(ops[2]).toMatchObject({
      from_entity_id: '00000000-0000-4000-8000-000000000601',
      to_entity_id: CHILD_ID,
      label: 'approved',
    });
  });
});

describe('runApprovalAddCommand', () => {
  it('patches the graph with the spliced approval', async () => {
    const patch = jest.fn().mockResolvedValue({ success: true });
    const client = {
      build: {
        workflows: {
          get_graph: jest.fn().mockResolvedValue({
            nodes: {
              [AFTER_ID]: { entity_id: AFTER_ID, entity_type: 'transformations' },
              [CHILD_ID]: { entity_id: CHILD_ID, upstream_entity_id: AFTER_ID },
            },
          }),
          patch_graph: patch,
        },
      },
    } as unknown as LoxtepClient;

    const result = await runApprovalAddCommand(client, {
      workflowId: WORKFLOW_ID,
      after: AFTER_ID,
      name: 'Lease review',
      channel: 'inbox',
      timeoutHours: '24',
      projectId: PROJECT_ID,
    });

    expect(result.exitCode).toBe(0);
    expect(patch).toHaveBeenCalledWith(
      WORKFLOW_ID,
      PROJECT_ID,
      expect.objectContaining({
        operations: expect.arrayContaining([
          expect.objectContaining({ op: 'add_node', entity_type: 'approvals' }),
          expect.objectContaining({ op: 'connect_nodes', from_entity_id: AFTER_ID }),
          expect.objectContaining({
            op: 'connect_nodes_labeled',
            to_entity_id: CHILD_ID,
            label: 'approved',
          }),
        ]),
      }),
    );
  });
});
