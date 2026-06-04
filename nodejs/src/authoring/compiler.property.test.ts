import fc from 'fast-check';
import { compileModule } from './compiler';
import type { GraphPatchOp } from './compiler';
import type { DataWorkflowModule, TriggerSpec } from './types';
import type { NormalizedContext, NormalizedResource } from '../codegen/types';

/**
 * Feature: ai-first-platform-surface
 * Property 12: Compiler graph-structure mapping
 *
 * For any valid DataWorkflowModule, the compiled output contains the correct
 * graph structure: each trigger maps to a connection/ingestion node, the handler
 * maps to a transform node, and all trigger nodes are connected to the handler node.
 *
 * **Validates: Requirements 3.4**
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary valid workflow name (1–64 alphanumeric + hyphen chars). */
const validNameArb = fc
  .integer({ min: 1, max: 64 })
  .chain((len) =>
    fc.array(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
      { minLength: len, maxLength: len },
    ).map((chars) => chars.join('')),
  )
  .filter((s) => s.length >= 1 && s.length <= 64);

/** Arbitrary trigger kind. */
const triggerKindArb = fc.constantFrom('queue', 'connector', 'schedule', 'webhook') as fc.Arbitrary<TriggerSpec['kind']>;

/** Arbitrary queue-kind trigger with ref. */
const queueTriggerArb = fc.record({
  kind: fc.constant('queue' as const),
  ref: fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `q_${s.replace(/[^a-z0-9]/gi, 'x')}`),
    name: fc.string({ minLength: 1, maxLength: 30 }).map((s) => s.replace(/[^a-z0-9_]/gi, 'x') || 'queue'),
  }),
});

/** Arbitrary connector-kind trigger with ref. */
const connectorTriggerArb = fc.record({
  kind: fc.constant('connector' as const),
  ref: fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `cn_${s.replace(/[^a-z0-9]/gi, 'x')}`),
    name: fc.string({ minLength: 1, maxLength: 30 }).map((s) => s.replace(/[^a-z0-9_]/gi, 'x') || 'connector'),
  }),
});

/** Arbitrary schedule-kind trigger. */
const scheduleTriggerArb = fc.record({
  kind: fc.constant('schedule' as const),
  schedule: fc.constantFrom('0 * * * *', '*/5 * * * *', '0 0 * * *'),
});

/** Arbitrary webhook-kind trigger. */
const webhookTriggerArb = fc.record({
  kind: fc.constant('webhook' as const),
  path: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/${s.replace(/[^a-z0-9/]/gi, 'x')}`),
});

/** Arbitrary valid trigger (any of the four kinds). */
const validTriggerArb: fc.Arbitrary<TriggerSpec> = fc.oneof(
  queueTriggerArb,
  connectorTriggerArb,
  scheduleTriggerArb,
  webhookTriggerArb,
);

/** Arbitrary non-empty trigger array (1–10 triggers). */
const validTriggersArb = fc
  .integer({ min: 1, max: 10 })
  .chain((count) => fc.array(validTriggerArb, { minLength: count, maxLength: count }));

/** Arbitrary valid DataWorkflowModule. */
const validModuleArb: fc.Arbitrary<DataWorkflowModule> = fc
  .tuple(validNameArb, validTriggersArb)
  .map(([name, triggers]) => ({
    name,
    triggers,
    handler: async () => {},
  }));

/** Arbitrary NormalizedContext (optionally with workflows for identity resolution). */
const contextArb: fc.Arbitrary<NormalizedContext> = fc.oneof(
  fc.constant(emptyContext()),
  fc
    .array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 30 }).map((s) => s.replace(/[^a-z0-9-]/gi, 'x') || 'wf'),
        id: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `wf_${s.replace(/[^a-z0-9]/gi, 'x')}`),
      }),
      { minLength: 0, maxLength: 5 },
    )
    .map((wfs) => contextWithWorkflows(wfs)),
);

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 12: Compiler graph-structure mapping', () => {
  it(
    'R3.4: each trigger produces exactly one connection/ingestion node',
    () => {
      fc.assert(
        fc.property(validModuleArb, contextArb, (mod, ctx) => {
          const result = compileModule(mod, ctx);

          // Count add_node ops with entity_type 'connections'
          const connectionNodes = result.ops.filter(
            (op): op is Extract<GraphPatchOp, { op: 'add_node' }> =>
              op.op === 'add_node' && 'entity_type' in op && (op as any).entity_type === 'connections',
          );

          // Must have exactly one connection node per trigger
          return connectionNodes.length === mod.triggers.length;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.4: the handler produces exactly one transform node',
    () => {
      fc.assert(
        fc.property(validModuleArb, contextArb, (mod, ctx) => {
          const result = compileModule(mod, ctx);

          // Count add_node ops with entity_type 'transformations'
          const transformNodes = result.ops.filter(
            (op): op is Extract<GraphPatchOp, { op: 'add_node' }> =>
              op.op === 'add_node' && 'entity_type' in op && (op as any).entity_type === 'transformations',
          );

          // Must have exactly one transform node for the handler
          return transformNodes.length === 1;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.4: every trigger node is connected to the handler node via connect_nodes',
    () => {
      fc.assert(
        fc.property(validModuleArb, contextArb, (mod, ctx) => {
          const result = compileModule(mod, ctx);

          // Collect connect_nodes ops
          const connectOps = result.ops.filter(
            (op): op is Extract<GraphPatchOp, { op: 'connect_nodes' }> =>
              op.op === 'connect_nodes',
          );

          // Must have exactly one connect_nodes per trigger
          if (connectOps.length !== mod.triggers.length) return false;

          // The handler entityId is deterministic: `${name}__handler`
          const handlerEntityId = `${mod.name}__handler`;

          // All connect_nodes must target the handler
          const allTargetHandler = connectOps.every(
            (op) => op.to_entity_id === handlerEntityId,
          );
          if (!allTargetHandler) return false;

          // Each connect_nodes from_entity_id should be a trigger node
          const expectedTriggerIds = mod.triggers.map(
            (_, i) => `${mod.name}__trigger_${i}`,
          );
          const actualFromIds = connectOps.map((op) => op.from_entity_id).sort();
          const expectedSorted = [...expectedTriggerIds].sort();

          return (
            actualFromIds.length === expectedSorted.length &&
            actualFromIds.every((id, idx) => id === expectedSorted[idx])
          );
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.4: trigger connection nodes carry the correct trigger_kind',
    () => {
      fc.assert(
        fc.property(validModuleArb, contextArb, (mod, ctx) => {
          const result = compileModule(mod, ctx);

          // Extract connection add_node ops in order
          const connectionNodes = result.ops.filter(
            (op): op is Extract<GraphPatchOp, { op: 'add_node' }> =>
              op.op === 'add_node' && 'entity_type' in op && (op as any).entity_type === 'connections',
          );

          // Each connection node's trigger_kind must match the corresponding trigger's kind
          return connectionNodes.every((op, i) => {
            return (op as any).entity.trigger_kind === mod.triggers[i].kind;
          });
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.4: queue/connector triggers propagate source_id from ref',
    () => {
      fc.assert(
        fc.property(validModuleArb, contextArb, (mod, ctx) => {
          const result = compileModule(mod, ctx);

          // Extract connection add_node ops in order
          const connectionNodes = result.ops.filter(
            (op): op is Extract<GraphPatchOp, { op: 'add_node' }> =>
              op.op === 'add_node' && 'entity_type' in op && (op as any).entity_type === 'connections',
          );

          // For each trigger with a ref (queue/connector), the connection node
          // must carry source_id matching the ref.id
          return connectionNodes.every((op, i) => {
            const trigger = mod.triggers[i];
            if (trigger.ref) {
              return (op as any).entity.source_id === trigger.ref.id;
            }
            // Non-ref triggers (schedule/webhook) should not have source_id
            return (op as any).entity.source_id === undefined;
          });
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.4: the compiled output name matches the module name',
    () => {
      fc.assert(
        fc.property(validModuleArb, contextArb, (mod, ctx) => {
          const result = compileModule(mod, ctx);
          return result.name === mod.name;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.4: the total graph ops count is triggers (add_node) + 1 handler (add_node) + triggers (connect_nodes)',
    () => {
      fc.assert(
        fc.property(validModuleArb, contextArb, (mod, ctx) => {
          const result = compileModule(mod, ctx);

          // Expected: N add_node(connections) + 1 add_node(transformations) + N connect_nodes
          const expectedOpCount = mod.triggers.length + 1 + mod.triggers.length;
          return result.ops.length === expectedOpCount;
        }),
        { numRuns: 100 },
      );
    },
  );
});
