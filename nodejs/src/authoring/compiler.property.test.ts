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

// ─── Node-related Arbitraries ─────────────────────────────────────────────────

/** Arbitrary short string for node names (1–128 characters, alphanumeric + hyphen). */
const nodeNameArb = fc
  .string({ minLength: 1, maxLength: 128 })
  .map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'x') || 'node');

/** Arbitrary approval channel (1–256 characters). */
const approvalChannelArb = fc
  .string({ minLength: 1, maxLength: 256 })
  .map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'x') || 'channel');

/** Arbitrary timeout hours (1–168). */
const timeoutHoursArb = fc.integer({ min: 1, max: 168 });

/** Arbitrary model ID (1–256 characters). */
const modelIdArb = fc
  .string({ minLength: 1, maxLength: 256 })
  .map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'x') || 'model');

/** Arbitrary prompt template (1–10000 characters). */
const promptTemplateArb = fc
  .string({ minLength: 1, maxLength: 500 })
  .map((s) => s || 'Summarize: {{event}}');

/** Arbitrary timeout seconds (1–300). */
const timeoutSecondsArb = fc.integer({ min: 1, max: 300 });

// ─── Property 21 & 22 Tests ──────────────────────────────────────────────────

describe('Feature: workflow-graph-approval-agent-nodes, Property 21: Compiler lowers nodes to graph ops', () => {
  /**
   * **Validates: Requirements 9.3, 9.4, 10.1, 10.2**
   *
   * For any valid DataWorkflowModule with resolvable nodes, compiled ops include
   * exactly one add_node per node (correct entity_type), a connect_nodes from
   * upstream, and connect_nodes_labeled for each labeled downstream.
   */

  it(
    'P21: each declared node produces exactly one add_node with correct entity_type',
    () => {
      fc.assert(
        fc.property(
          validNameArb,
          validTriggersArb,
          fc.array(
            fc.oneof(
              // ApprovalNodeSpec with approved pointing to another node
              fc.tuple(nodeNameArb, approvalChannelArb, timeoutHoursArb, nodeNameArb).map(
                ([name, channel, hours, approvedTarget]) => ({
                  kind: 'approval' as const,
                  name: `apv_${name}`,
                  approvalChannel: channel,
                  timeoutHours: hours,
                  upstream: 'handler',
                  approved: `agt_${approvedTarget}`,
                }),
              ),
              // AgentNodeSpec
              fc.tuple(nodeNameArb, modelIdArb, promptTemplateArb, timeoutSecondsArb).map(
                ([name, modelId, prompt, timeout]) => ({
                  kind: 'agent' as const,
                  name: `agt_${name}`,
                  modelId,
                  promptTemplate: prompt,
                  timeoutSeconds: timeout,
                  upstream: 'handler',
                }),
              ),
            ),
            { minLength: 1, maxLength: 5 },
          ),
          (workflowName, triggers, rawNodes) => {
            // Ensure unique node names
            const seen = new Set<string>();
            const nodes = rawNodes.filter((n) => {
              if (seen.has(n.name)) return false;
              seen.add(n.name);
              return true;
            });
            if (nodes.length === 0) return; // skip degenerate case

            // Make sure approval nodes have valid approved targets that exist
            const nodeNames = new Set(nodes.map((n) => n.name));
            const fixedNodes = nodes.map((n) => {
              if (n.kind === 'approval') {
                // approved target must be an existing node name
                const target = nodes.find((other) => other.name !== n.name);
                return {
                  ...n,
                  approved: target ? target.name : undefined,
                  // Ensure at least one labeled downstream for approval nodes
                  rejected: !target ? nodes.find((other) => other.name !== n.name)?.name : undefined,
                };
              }
              return n;
            });

            // Ensure every approval node has at least one labeled downstream
            const validNodes = fixedNodes.filter((n) => {
              if (n.kind === 'approval') {
                return n.approved || n.rejected;
              }
              return true;
            });
            if (validNodes.length === 0) return;

            const mod: DataWorkflowModule = {
              name: workflowName,
              triggers,
              handler: async () => {},
              nodes: validNodes as any,
            };

            const result = compileModule(mod, emptyContext());

            // Count add_node ops for approvals/agents
            const approvalAddNodes = result.ops.filter(
              (op) => op.op === 'add_node' && (op as any).entity_type === 'approvals',
            );
            const agentAddNodes = result.ops.filter(
              (op) => op.op === 'add_node' && (op as any).entity_type === 'agents',
            );

            const expectedApprovals = validNodes.filter((n) => n.kind === 'approval').length;
            const expectedAgents = validNodes.filter((n) => n.kind === 'agent').length;

            expect(approvalAddNodes.length).toBe(expectedApprovals);
            expect(agentAddNodes.length).toBe(expectedAgents);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'P21: each node has a connect_nodes from its upstream (handler)',
    () => {
      fc.assert(
        fc.property(
          validNameArb,
          validTriggersArb,
          fc.array(
            fc.oneof(
              fc.tuple(nodeNameArb, approvalChannelArb, timeoutHoursArb).map(
                ([name, channel, hours]) => ({
                  kind: 'approval' as const,
                  name: `apv_${name}`,
                  approvalChannel: channel,
                  timeoutHours: hours,
                  upstream: 'handler',
                }),
              ),
              fc.tuple(nodeNameArb, modelIdArb, promptTemplateArb).map(
                ([name, modelId, prompt]) => ({
                  kind: 'agent' as const,
                  name: `agt_${name}`,
                  modelId,
                  promptTemplate: prompt,
                  upstream: 'handler',
                }),
              ),
            ),
            { minLength: 1, maxLength: 5 },
          ),
          (workflowName, triggers, rawNodes) => {
            // Ensure unique node names
            const seen = new Set<string>();
            const nodes = rawNodes.filter((n) => {
              if (seen.has(n.name)) return false;
              seen.add(n.name);
              return true;
            });
            if (nodes.length === 0) return;

            // For approval nodes, add a valid labeled downstream
            const nodeNames = nodes.map((n) => n.name);
            const fixedNodes = nodes.map((n, i) => {
              if (n.kind === 'approval') {
                // Point approved to another node in the set (or create a self-referencing pair)
                const otherNode = nodes.find((other) => other.name !== n.name);
                return { ...n, approved: otherNode ? otherNode.name : undefined, rejected: otherNode ? undefined : undefined };
              }
              return n;
            });

            // Only keep approval nodes that have at least one labeled downstream
            const validNodes = fixedNodes.filter((n) => {
              if (n.kind === 'approval') return !!(n as any).approved || !!(n as any).rejected;
              return true;
            });
            if (validNodes.length === 0) return;

            const mod: DataWorkflowModule = {
              name: workflowName,
              triggers,
              handler: async () => {},
              nodes: validNodes as any,
            };

            const result = compileModule(mod, emptyContext());

            const handlerEntityId = `${workflowName}__handler`;

            // Each node should have a connect_nodes from handler to its entity_id
            const connectOps = result.ops.filter(
              (op) => op.op === 'connect_nodes' && (op as any).from_entity_id === handlerEntityId,
            );

            // Should have at least one connect_nodes from handler for each node
            const nodeEntityIds = validNodes.map((n) => `${workflowName}__node_${n.name}`);
            for (const expectedId of nodeEntityIds) {
              const found = connectOps.some((op) => (op as any).to_entity_id === expectedId);
              expect(found).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'P21: approval nodes emit connect_nodes_labeled for each labeled downstream',
    () => {
      fc.assert(
        fc.property(
          validNameArb,
          validTriggersArb,
          fc.tuple(nodeNameArb, nodeNameArb, approvalChannelArb, timeoutHoursArb).filter(
            ([approvalName, agentName]) => approvalName !== agentName,
          ),
          (workflowName, triggers, [approvalName, agentName, channel, hours]) => {
            const nodes = [
              {
                kind: 'approval' as const,
                name: `apv_${approvalName}`,
                approvalChannel: channel,
                timeoutHours: hours,
                upstream: 'handler',
                approved: `agt_${agentName}`,
              },
              {
                kind: 'agent' as const,
                name: `agt_${agentName}`,
                modelId: 'test-model',
                promptTemplate: 'test prompt',
                upstream: 'handler',
              },
            ];

            const mod: DataWorkflowModule = {
              name: workflowName,
              triggers,
              handler: async () => {},
              nodes,
            };

            const result = compileModule(mod, emptyContext());

            // Find connect_nodes_labeled ops
            const labeledOps = result.ops.filter(
              (op) => op.op === 'connect_nodes_labeled',
            );

            // Should have exactly one labeled op for the approved path
            const approvalEntityId = `${workflowName}__node_apv_${approvalName}`;
            const agentEntityId = `${workflowName}__node_agt_${agentName}`;

            const approvedOp = labeledOps.find(
              (op) =>
                (op as any).from_entity_id === approvalEntityId &&
                (op as any).to_entity_id === agentEntityId &&
                (op as any).label === 'approved',
            );
            expect(approvedOp).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'P21: agent nodes emit connect_nodes_labeled for error path when error is specified',
    () => {
      fc.assert(
        fc.property(
          validNameArb,
          validTriggersArb,
          fc.tuple(nodeNameArb, nodeNameArb, modelIdArb, promptTemplateArb).filter(
            ([agentName, errorTargetName]) => agentName !== errorTargetName,
          ),
          (workflowName, triggers, [agentName, errorTargetName, modelId, prompt]) => {
            const nodes = [
              {
                kind: 'agent' as const,
                name: `agt_${agentName}`,
                modelId,
                promptTemplate: prompt,
                upstream: 'handler',
                error: `agt_${errorTargetName}`,
              },
              {
                kind: 'agent' as const,
                name: `agt_${errorTargetName}`,
                modelId: 'error-handler-model',
                promptTemplate: 'handle error',
                upstream: 'handler',
              },
            ];

            const mod: DataWorkflowModule = {
              name: workflowName,
              triggers,
              handler: async () => {},
              nodes,
            };

            const result = compileModule(mod, emptyContext());

            // Find connect_nodes_labeled ops
            const labeledOps = result.ops.filter(
              (op) => op.op === 'connect_nodes_labeled',
            );

            const agentEntityId = `${workflowName}__node_agt_${agentName}`;
            const errorEntityId = `${workflowName}__node_agt_${errorTargetName}`;

            const errorOp = labeledOps.find(
              (op) =>
                (op as any).from_entity_id === agentEntityId &&
                (op as any).to_entity_id === errorEntityId &&
                (op as any).label === 'error',
            );
            expect(errorOp).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

describe('Feature: workflow-graph-approval-agent-nodes, Property 22: Compiler placement validation', () => {
  /**
   * **Validates: Requirements 9.3, 9.4, 10.1, 10.2, 10.3**
   *
   * Compilation rejected if any node lacks upstream or any Approval_Node lacks
   * labeled downstream; accepted when both hold.
   */

  it(
    'P22: compilation throws when a node has an invalid upstream (name that does not exist)',
    () => {
      fc.assert(
        fc.property(
          validNameArb,
          validTriggersArb,
          nodeNameArb,
          fc.string({ minLength: 1, maxLength: 128 }).map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'x') || 'bogus'),
          (workflowName, triggers, nodeName, invalidUpstream) => {
            // Ensure the upstream name cannot match any known name
            const safeInvalidUpstream = `nonexistent_${invalidUpstream}`;

            const nodes = [
              {
                kind: 'agent' as const,
                name: `agt_${nodeName}`,
                modelId: 'test-model',
                promptTemplate: 'test prompt',
                upstream: safeInvalidUpstream,
              },
            ];

            const mod: DataWorkflowModule = {
              name: workflowName,
              triggers,
              handler: async () => {},
              nodes,
            };

            expect(() => compileModule(mod, emptyContext())).toThrow();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'P22: compilation throws when an ApprovalNodeSpec is missing both approved and rejected',
    () => {
      fc.assert(
        fc.property(
          validNameArb,
          validTriggersArb,
          nodeNameArb,
          approvalChannelArb,
          timeoutHoursArb,
          (workflowName, triggers, nodeName, channel, hours) => {
            const nodes = [
              {
                kind: 'approval' as const,
                name: `apv_${nodeName}`,
                approvalChannel: channel,
                timeoutHours: hours,
                upstream: 'handler',
                // No approved, no rejected
              },
            ];

            const mod: DataWorkflowModule = {
              name: workflowName,
              triggers,
              handler: async () => {},
              nodes,
            };

            expect(() => compileModule(mod, emptyContext())).toThrow();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'P22: compilation succeeds when all nodes have valid upstream and approval nodes have labeled downstream',
    () => {
      fc.assert(
        fc.property(
          validNameArb,
          validTriggersArb,
          fc.tuple(nodeNameArb, nodeNameArb, approvalChannelArb, timeoutHoursArb, modelIdArb, promptTemplateArb).filter(
            ([approvalName, agentName]) => approvalName !== agentName,
          ),
          (workflowName, triggers, [approvalName, agentName, channel, hours, modelId, prompt]) => {
            const nodes = [
              {
                kind: 'approval' as const,
                name: `apv_${approvalName}`,
                approvalChannel: channel,
                timeoutHours: hours,
                upstream: 'handler',
                approved: `agt_${agentName}`,
              },
              {
                kind: 'agent' as const,
                name: `agt_${agentName}`,
                modelId,
                promptTemplate: prompt,
                upstream: 'handler',
              },
            ];

            const mod: DataWorkflowModule = {
              name: workflowName,
              triggers,
              handler: async () => {},
              nodes,
            };

            // Should not throw
            const result = compileModule(mod, emptyContext());
            expect(result).toBeDefined();
            expect(result.ops.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

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
