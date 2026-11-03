import { compileModule } from './compiler';
import type { GraphPatchOp } from './compiler';
import type { DataWorkflowModule } from './types';
import type { NormalizedContext } from '../codegen/types';
import { approvalGraphPatchFromCompiledOps } from './approval-graph-patch';

const WORKFLOW_ID = '00000000-0000-4000-8000-000000000201';
const EXISTING_DP = '00000000-0000-4000-8000-000000000203';

function emptyContext(): NormalizedContext {
  return {
    dataProducts: [],
    connectors: [],
    domains: [],
    queues: [],
    flows: [],
    workflows: [],
  };
}

function handlerModule(nodes?: DataWorkflowModule['nodes']): DataWorkflowModule {
  return {
    name: 'pms-lease-updater',
    triggers: [{ kind: 'webhook', path: '/slack/action' }],
    handler: async () => {},
    ...(nodes ? { nodes } : {}),
  };
}

describe('approvalGraphPatchFromCompiledOps', () => {
  it('keeps an approval add_node with a UUID id and drops the handler', () => {
    const compiled = compileModule(
      handlerModule([
        {
          kind: 'approval',
          name: 'lease-review',
          approvalChannel: 'inbox',
          timeoutHours: 24,
          upstream: 'handler',
          approved: 'handler',
        },
      ]),
      emptyContext(),
    );

    let n = 0;
    const ops = approvalGraphPatchFromCompiledOps(compiled.ops, {
      workflowId: WORKFLOW_ID,
      idFactory: () => `00000000-0000-4000-8000-00000000060${n++}`,
    });

    expect(ops.some((op) => op.op === 'add_node' && op.entity_type !== 'approvals')).toBe(false);
    expect(ops.some((op) => JSON.stringify(op).includes('code_handler'))).toBe(false);
    const add = ops.find((op) => op.op === 'add_node');
    expect(add).toMatchObject({
      op: 'add_node',
      entity_type: 'approvals',
      entity: {
        approval_node_id: '00000000-0000-4000-8000-000000000600',
        workflow_id: WORKFLOW_ID,
        name: 'lease-review',
        approval_channel: 'inbox',
        timeout_hours: 24,
      },
    });
    expect(ops.filter((op) => op.op === 'connect_nodes' || op.op === 'connect_nodes_labeled')).toEqual([]);
  });

  it('drops every op from a handler-only module', () => {
    const compiled = compileModule(handlerModule(), emptyContext());
    expect(compiled.ops.some((op) => op.op === 'add_node' && op.entity.transform_type === 'code_handler')).toBe(
      true,
    );
    expect(approvalGraphPatchFromCompiledOps(compiled.ops, { workflowId: WORKFLOW_ID })).toEqual([]);
  });

  it('keeps a labeled edge when both ends are an approval id and an existing UUID', () => {
    const approvalId = 'pms-lease-updater__node_lease-review';
    const ops: GraphPatchOp[] = [
      {
        op: 'add_node',
        entity_type: 'approvals',
        entity: {
          approval_node_id: approvalId,
          name: 'lease-review',
          approval_channel: 'inbox',
          timeout_hours: 24,
        },
      },
      {
        op: 'connect_nodes',
        from_entity_id: EXISTING_DP,
        to_entity_id: approvalId,
      },
      {
        op: 'connect_nodes_labeled',
        from_entity_id: approvalId,
        to_entity_id: EXISTING_DP,
        label: 'approved',
      },
      {
        op: 'add_node',
        entity_type: 'agents',
        entity: { agent_node_id: 'pms-lease-updater__node_agent', name: 'agent' },
      },
    ];

    const filtered = approvalGraphPatchFromCompiledOps(ops, {
      workflowId: WORKFLOW_ID,
      idFactory: () => '00000000-0000-4000-8000-000000000601',
    });

    expect(filtered).toEqual([
      {
        op: 'add_node',
        entity_type: 'approvals',
        entity: {
          approval_node_id: '00000000-0000-4000-8000-000000000601',
          name: 'lease-review',
          approval_channel: 'inbox',
          timeout_hours: 24,
          workflow_id: WORKFLOW_ID,
        },
      },
      {
        op: 'connect_nodes',
        from_entity_id: EXISTING_DP,
        to_entity_id: '00000000-0000-4000-8000-000000000601',
      },
      {
        op: 'connect_nodes_labeled',
        from_entity_id: '00000000-0000-4000-8000-000000000601',
        to_entity_id: EXISTING_DP,
        label: 'approved',
      },
    ]);
  });
});
