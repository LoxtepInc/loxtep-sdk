/**
 * Unit tests for the pure deploy compiler (`compileModule` + `computeRemovalSet`).
 *
 * Validates:
 * - R3.4: trigger → connection/ingestion node, handler → transform node, graph connections
 * - R3.5: in-place update resolves workflow_id by name
 * - R3.7: removal set targets workflows absent from the project
 */

import { compileModule, computeRemovalSet } from './compiler';
import type { CompiledWorkflow, GraphPatchOp, ResourceRef } from './compiler';
import type { DataWorkflowModule, TriggerSpec } from './types';
import type { NormalizedContext, NormalizedResource } from '../codegen/types';
import { on } from './triggers';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

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

function contextWithWorkflows(
  workflows: Array<{ name: string; id: string }>,
): NormalizedContext {
  return {
    ...emptyContext(),
    workflows: workflows.map((w) => ({
      key: w.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      data: w,
    })),
  };
}

function validModule(overrides: Partial<DataWorkflowModule> = {}): DataWorkflowModule {
  return {
    name: 'test-workflow',
    triggers: [on.schedule('0 * * * *')],
    handler: async () => {},
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// compileModule
// ────────────────────────────────────────────────────────────────────────────

describe('compileModule', () => {
  describe('graph lowering (R3.4)', () => {
    it('produces add_node for each trigger as a connections entity', () => {
      const mod = validModule({
        triggers: [on.schedule('0 * * * *'), on.webhook('/ingest')],
      });
      const result = compileModule(mod, emptyContext());

      const addOps = result.ops.filter(
        (op) => op.op === 'add_node' && 'entity_type' in op && op.entity_type === 'connections',
      );
      expect(addOps).toHaveLength(2);
    });

    it('produces add_node for the handler as a transformations entity', () => {
      const mod = validModule();
      const result = compileModule(mod, emptyContext());

      const transformOps = result.ops.filter(
        (op) =>
          op.op === 'add_node' && 'entity_type' in op && op.entity_type === 'transformations',
      );
      expect(transformOps).toHaveLength(1);
    });

    it('connects each trigger node to the handler node', () => {
      const mod = validModule({
        triggers: [on.schedule('0 * * * *'), on.webhook('/ingest')],
      });
      const result = compileModule(mod, emptyContext());

      const connectOps = result.ops.filter((op) => op.op === 'connect_nodes');
      expect(connectOps).toHaveLength(2);

      // All connect_nodes should target the handler entity
      const handlerEntityId = `${mod.name}__handler`;
      for (const op of connectOps) {
        if (op.op === 'connect_nodes') {
          expect(op.to_entity_id).toBe(handlerEntityId);
        }
      }
    });

    it('sets trigger_kind on each trigger connection node', () => {
      const mod = validModule({
        triggers: [on.queueEvent({ id: 'q_1', name: 'orders' })],
      });
      const result = compileModule(mod, emptyContext());

      const addOp = result.ops.find(
        (op) => op.op === 'add_node' && 'entity_type' in op && op.entity_type === 'connections',
      );
      expect(addOp).toBeDefined();
      if (addOp && addOp.op === 'add_node') {
        expect(addOp.entity.trigger_kind).toBe('queue');
      }
    });

    it('sets source_id and source_name for trigger refs', () => {
      const mod = validModule({
        triggers: [on.queueEvent({ id: 'q_abc', name: 'my_queue' })],
      });
      const result = compileModule(mod, emptyContext());

      const addOp = result.ops.find(
        (op) => op.op === 'add_node' && 'entity_type' in op && op.entity_type === 'connections',
      );
      if (addOp && addOp.op === 'add_node') {
        expect(addOp.entity.source_id).toBe('q_abc');
        expect(addOp.entity.source_name).toBe('my_queue');
      }
    });

    it('sets schedule on schedule-type trigger nodes', () => {
      const mod = validModule({
        triggers: [on.schedule('*/5 * * * *')],
      });
      const result = compileModule(mod, emptyContext());

      const addOp = result.ops.find(
        (op) => op.op === 'add_node' && 'entity_type' in op && op.entity_type === 'connections',
      );
      if (addOp && addOp.op === 'add_node') {
        expect(addOp.entity.schedule).toBe('*/5 * * * *');
      }
    });

    it('sets webhook_path on webhook-type trigger nodes', () => {
      const mod = validModule({
        triggers: [on.webhook('/events/orders')],
      });
      const result = compileModule(mod, emptyContext());

      const addOp = result.ops.find(
        (op) => op.op === 'add_node' && 'entity_type' in op && op.entity_type === 'connections',
      );
      if (addOp && addOp.op === 'add_node') {
        expect(addOp.entity.webhook_path).toBe('/events/orders');
      }
    });

    it('sets module_name on the handler transform node', () => {
      const mod = validModule({ name: 'my-wf' });
      const result = compileModule(mod, emptyContext());

      const transformOp = result.ops.find(
        (op) =>
          op.op === 'add_node' && 'entity_type' in op && op.entity_type === 'transformations',
      );
      if (transformOp && transformOp.op === 'add_node') {
        expect(transformOp.entity.module_name).toBe('my-wf');
      }
    });

    it('uses deterministic node IDs based on workflow name', () => {
      const mod = validModule({ name: 'orders-sync' });
      const result = compileModule(mod, emptyContext());

      const connectOp = result.ops.find((op) => op.op === 'connect_nodes');
      if (connectOp && connectOp.op === 'connect_nodes') {
        expect(connectOp.from_entity_id).toBe('orders-sync__trigger_0');
        expect(connectOp.to_entity_id).toBe('orders-sync__handler');
      }
    });
  });

  describe('in-place identity resolution (R3.5)', () => {
    it('resolves workflow_id when a workflow of the same name exists in context', () => {
      const ctx = contextWithWorkflows([
        { name: 'test-workflow', id: 'wf_existing_123' },
      ]);
      const mod = validModule({ name: 'test-workflow' });
      const result = compileModule(mod, ctx);

      expect(result.workflow_id).toBe('wf_existing_123');
    });

    it('omits workflow_id when no matching workflow exists in context', () => {
      const ctx = contextWithWorkflows([
        { name: 'other-workflow', id: 'wf_other' },
      ]);
      const mod = validModule({ name: 'test-workflow' });
      const result = compileModule(mod, ctx);

      expect(result.workflow_id).toBeUndefined();
    });

    it('omits workflow_id when context has no workflows', () => {
      const mod = validModule({ name: 'new-workflow' });
      const result = compileModule(mod, emptyContext());

      expect(result.workflow_id).toBeUndefined();
    });

    it('matches workflow name exactly (case-sensitive)', () => {
      const ctx = contextWithWorkflows([
        { name: 'Test-Workflow', id: 'wf_upper' },
        { name: 'test-workflow', id: 'wf_lower' },
      ]);
      const mod = validModule({ name: 'test-workflow' });
      const result = compileModule(mod, ctx);

      expect(result.workflow_id).toBe('wf_lower');
    });
  });

  describe('referencedResources collection', () => {
    it('collects queue references from queue-kind triggers', () => {
      const mod = validModule({
        triggers: [on.queueEvent({ id: 'q_orders', name: 'orders_raw' })],
      });
      const result = compileModule(mod, emptyContext());

      expect(result.referencedResources).toContainEqual({
        type: 'queue',
        id: 'q_orders',
        name: 'orders_raw',
      });
    });

    it('collects connector references from connector-kind triggers', () => {
      const mod = validModule({
        triggers: [on.connectorEvent({ id: 'cn_shopify', type: 'shopify' })],
      });
      const result = compileModule(mod, emptyContext());

      expect(result.referencedResources).toContainEqual({
        type: 'connector',
        id: 'cn_shopify',
        name: 'shopify',
      });
    });

    it('does not collect references from schedule triggers', () => {
      const mod = validModule({
        triggers: [on.schedule('0 * * * *')],
      });
      const result = compileModule(mod, emptyContext());

      expect(result.referencedResources).toHaveLength(0);
    });

    it('does not collect references from webhook triggers', () => {
      const mod = validModule({
        triggers: [on.webhook('/hook')],
      });
      const result = compileModule(mod, emptyContext());

      expect(result.referencedResources).toHaveLength(0);
    });

    it('collects multiple references from multiple triggers', () => {
      const mod = validModule({
        triggers: [
          on.queueEvent({ id: 'q_1', name: 'queue_one' }),
          on.connectorEvent({ id: 'cn_2', type: 'postgres' }),
          on.schedule('0 * * * *'),
        ],
      });
      const result = compileModule(mod, emptyContext());

      expect(result.referencedResources).toHaveLength(2);
      expect(result.referencedResources).toContainEqual({
        type: 'queue',
        id: 'q_1',
        name: 'queue_one',
      });
      expect(result.referencedResources).toContainEqual({
        type: 'connector',
        id: 'cn_2',
        name: 'postgres',
      });
    });
  });

  describe('output structure', () => {
    it('sets the workflow name from the module', () => {
      const mod = validModule({ name: 'my-workflow' });
      const result = compileModule(mod, emptyContext());

      expect(result.name).toBe('my-workflow');
    });

    it('is a pure function: same inputs produce same outputs', () => {
      const mod = validModule({
        name: 'deterministic',
        triggers: [on.queueEvent({ id: 'q_1', name: 'q' }), on.schedule('0 * * * *')],
      });
      const ctx = contextWithWorkflows([{ name: 'deterministic', id: 'wf_det' }]);

      const result1 = compileModule(mod, ctx);
      const result2 = compileModule(mod, ctx);

      expect(result1).toEqual(result2);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeRemovalSet
// ────────────────────────────────────────────────────────────────────────────

describe('computeRemovalSet (R3.7)', () => {
  it('returns empty removals when all context workflows are in the project', () => {
    const ctx = contextWithWorkflows([
      { name: 'wf-a', id: 'wf_a' },
      { name: 'wf-b', id: 'wf_b' },
    ]);
    const projectModuleNames = new Set(['wf-a', 'wf-b']);
    const result = computeRemovalSet(projectModuleNames, ctx);

    expect(result.removals).toHaveLength(0);
    expect(result.ops).toHaveLength(0);
  });

  it('returns removal ops for workflows absent from the project', () => {
    const ctx = contextWithWorkflows([
      { name: 'wf-a', id: 'wf_a' },
      { name: 'wf-b', id: 'wf_b' },
      { name: 'wf-c', id: 'wf_c' },
    ]);
    const projectModuleNames = new Set(['wf-a']);
    const result = computeRemovalSet(projectModuleNames, ctx);

    expect(result.removals).toHaveLength(2);
    expect(result.removals).toContainEqual({ name: 'wf-b', workflow_id: 'wf_b' });
    expect(result.removals).toContainEqual({ name: 'wf-c', workflow_id: 'wf_c' });
  });

  it('emits remove_node ops with the correct entity_id', () => {
    const ctx = contextWithWorkflows([
      { name: 'old-wf', id: 'wf_old_123' },
    ]);
    const projectModuleNames = new Set<string>();
    const result = computeRemovalSet(projectModuleNames, ctx);

    expect(result.ops).toHaveLength(1);
    expect(result.ops[0]).toEqual({ op: 'remove_node', entity_id: 'wf_old_123' });
  });

  it('returns empty when context has no workflows', () => {
    const ctx = emptyContext();
    const projectModuleNames = new Set(['some-wf']);
    const result = computeRemovalSet(projectModuleNames, ctx);

    expect(result.removals).toHaveLength(0);
    expect(result.ops).toHaveLength(0);
  });

  it('does not remove workflows that are in the project set', () => {
    const ctx = contextWithWorkflows([
      { name: 'keep-me', id: 'wf_keep' },
      { name: 'remove-me', id: 'wf_remove' },
    ]);
    const projectModuleNames = new Set(['keep-me']);
    const result = computeRemovalSet(projectModuleNames, ctx);

    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].name).toBe('remove-me');
    expect(result.ops).not.toContainEqual(
      expect.objectContaining({ entity_id: 'wf_keep' }),
    );
  });
});
