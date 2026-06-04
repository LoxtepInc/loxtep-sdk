/**
 * Pure deploy compiler — `compileModule`
 *
 * Lowers a `DataWorkflowModule` into `GraphPatchOp[]` mirroring the backend's
 * `graph-patch-apply.ts` shape. This is a pure function: no I/O, no network.
 *
 * Responsibilities:
 * - Trigger → connection/ingestion node
 * - Handler steps → transform node(s)
 * - Sinks → data-product node(s)
 * - Resolve `workflow_id` by name for in-place update (R3.5)
 * - Collect `referencedResources` for pre-deploy existence validation (R1.8)
 * - Compute removal set: modules on instance but absent from project (R3.7)
 *
 * Requirements: 3.4, 3.5, 3.7
 */

import type { DataWorkflowModule, TriggerSpec } from './types.js';
import type { NormalizedContext } from '../codegen/types.js';

// ────────────────────────────────────────────────────────────────────────────
// Types mirroring backend's graph-patch-apply.ts
// ────────────────────────────────────────────────────────────────────────────

export type GraphPatchOp =
  | { op: 'add_node'; entity_type: string; entity: Record<string, unknown> }
  | { op: 'update_node'; entity_id: string; patch: Record<string, unknown> }
  | { op: 'remove_node'; entity_id: string }
  | { op: 'connect_nodes'; from_entity_id: string; to_entity_id: string }
  | { op: 'disconnect_nodes'; from_entity_id: string; to_entity_id: string }
  | { op: 'update_workflow'; patch: Record<string, unknown> };

/**
 * A reference to a platform resource used by the compiled workflow.
 * Used for pre-deploy existence validation (R1.8).
 */
export interface ResourceRef {
  type: 'queue' | 'connector' | 'data_product' | 'workflow' | 'domain';
  id: string;
  name?: string;
}

/**
 * The output of `compileModule` — a compiled workflow ready for deployment.
 */
export interface CompiledWorkflow {
  /** The workflow name from the module. */
  name: string;
  /** Resolved workflow_id if a workflow of this name already exists (in-place update, R3.5). */
  workflow_id?: string;
  /** Graph patch operations that create/update the workflow's graph nodes and edges. */
  ops: GraphPatchOp[];
  /** All platform resources referenced by the module (for pre-deploy validation). */
  referencedResources: ResourceRef[];
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

/** Generate a deterministic node ID from module name + a suffix. */
function nodeId(workflowName: string, suffix: string): string {
  return `${workflowName}__${suffix}`;
}

/**
 * Lower a single trigger into a connection/ingestion node + graph ops.
 * Returns the entity_id of the created node so downstream nodes can connect.
 */
function lowerTrigger(
  trigger: TriggerSpec,
  workflowName: string,
  index: number,
): { ops: GraphPatchOp[]; entityId: string; refs: ResourceRef[] } {
  const entityId = nodeId(workflowName, `trigger_${index}`);
  const refs: ResourceRef[] = [];

  const entity: Record<string, unknown> = {
    connection_id: entityId,
    name: `${workflowName}_trigger_${index}`,
    trigger_kind: trigger.kind,
  };

  if (trigger.ref) {
    entity.source_id = trigger.ref.id;
    entity.source_name = trigger.ref.name;

    // Collect the resource reference
    if (trigger.kind === 'queue') {
      refs.push({ type: 'queue', id: trigger.ref.id, name: trigger.ref.name });
    } else if (trigger.kind === 'connector') {
      refs.push({ type: 'connector', id: trigger.ref.id, name: trigger.ref.name });
    }
  }

  if (trigger.schedule) {
    entity.schedule = trigger.schedule;
  }
  if (trigger.path) {
    entity.webhook_path = trigger.path;
  }

  const ops: GraphPatchOp[] = [
    { op: 'add_node', entity_type: 'connections', entity },
  ];

  return { ops, entityId, refs };
}

/**
 * Lower the handler into a single transform node.
 * The handler itself is stored as a reference (name-based) — the actual execution
 * is handled at runtime by the deployed bot, not baked into the graph.
 */
function lowerHandler(
  workflowName: string,
): { ops: GraphPatchOp[]; entityId: string } {
  const entityId = nodeId(workflowName, 'handler');

  const entity: Record<string, unknown> = {
    transformation_id: entityId,
    name: `${workflowName}_handler`,
    transform_type: 'code_handler',
    module_name: workflowName,
  };

  const ops: GraphPatchOp[] = [
    { op: 'add_node', entity_type: 'transformations', entity },
  ];

  return { ops, entityId };
}

/**
 * Resolve the `workflow_id` for a module by name from the NormalizedContext.
 * If a workflow with the same name exists, returns its id for in-place update (R3.5).
 */
function resolveWorkflowId(
  workflowName: string,
  ctx: NormalizedContext,
): string | undefined {
  const match = ctx.workflows.find((w) => w.data.name === workflowName);
  return match?.data.id;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compile a single `DataWorkflowModule` into a `CompiledWorkflow`.
 *
 * This is a **pure function**: it performs no I/O, no network calls. Given the
 * same module and context, it always produces the same output.
 *
 * Graph lowering:
 * - Each trigger → a `connections` (ingestion) node
 * - The handler → a `transformations` node
 * - All trigger nodes connect to the handler node
 *
 * @param mod - The data workflow module to compile
 * @param ctx - The normalized workspace context (provides workflow identity lookup)
 * @returns A `CompiledWorkflow` with ops, referencedResources, and optional workflow_id
 */
export function compileModule(
  mod: DataWorkflowModule,
  ctx: NormalizedContext,
): CompiledWorkflow {
  const ops: GraphPatchOp[] = [];
  const referencedResources: ResourceRef[] = [];

  // Resolve workflow identity for in-place update (R3.5)
  const workflow_id = resolveWorkflowId(mod.name, ctx);

  // Lower each trigger into a connection/ingestion node
  const triggerEntityIds: string[] = [];
  for (let i = 0; i < mod.triggers.length; i++) {
    const trigger = mod.triggers[i];
    const result = lowerTrigger(trigger, mod.name, i);
    ops.push(...result.ops);
    triggerEntityIds.push(result.entityId);
    referencedResources.push(...result.refs);
  }

  // Lower handler into a transform node
  const handler = lowerHandler(mod.name);
  ops.push(...handler.ops);

  // Connect each trigger node to the handler node
  for (const triggerId of triggerEntityIds) {
    ops.push({
      op: 'connect_nodes',
      from_entity_id: triggerId,
      to_entity_id: handler.entityId,
    });
  }

  return {
    name: mod.name,
    ...(workflow_id !== undefined ? { workflow_id } : {}),
    ops,
    referencedResources,
  };
}

/**
 * Compute the removal set: workflows present on the instance but absent from
 * the current set of project modules (R3.7).
 *
 * Returns `remove_node` operations for each workflow that should be deleted,
 * along with the workflow identities (name + id) for reporting.
 *
 * @param projectModuleNames - The set of module names currently in the project
 * @param ctx - The normalized workspace context (contains instance workflows)
 * @returns An object with removal ops and the names/ids of removed workflows
 */
export function computeRemovalSet(
  projectModuleNames: Set<string>,
  ctx: NormalizedContext,
): { removals: Array<{ name: string; workflow_id: string }>; ops: GraphPatchOp[] } {
  const removals: Array<{ name: string; workflow_id: string }> = [];
  const ops: GraphPatchOp[] = [];

  for (const wf of ctx.workflows) {
    if (!projectModuleNames.has(wf.data.name)) {
      removals.push({ name: wf.data.name, workflow_id: wf.data.id });
      ops.push({ op: 'remove_node', entity_id: wf.data.id });
    }
  }

  return { removals, ops };
}
