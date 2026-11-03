/**
 * Turn compiled code-first ops into a graph PUT that only persists approval nodes.
 *
 * `compileModule` also emits trigger connections and a `code_handler` transform.
 * Those are not platform entities. Compiler node ids are `${workflow}__${suffix}`,
 * and graph PUT requires UUID entity ids, so approval ids are remapped here.
 * Connects stay only when both ends resolve to a UUID and the edge touches an
 * approval node this patch adds.
 */

import { randomUUID } from 'node:crypto';
import type { GraphPatchOp } from './compiler.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export interface ApprovalGraphPatchOptions {
  /** Stamped onto each approval entity. The approval JSON schema requires it. */
  workflowId?: string;
  /** Test seam. Defaults to randomUUID. */
  idFactory?: () => string;
}

export function approvalGraphPatchFromCompiledOps(
  ops: readonly GraphPatchOp[],
  options: ApprovalGraphPatchOptions = {},
): GraphPatchOp[] {
  const idFactory = options.idFactory ?? randomUUID;
  const approvalIds = new Map<string, string>();

  for (const op of ops) {
    if (op.op !== 'add_node' || op.entity_type !== 'approvals') continue;
    const raw = op.entity.approval_node_id;
    if (typeof raw !== 'string' || raw.length === 0) continue;
    approvalIds.set(raw, isUuid(raw) ? raw : idFactory());
  }

  const resolve = (id: string): string | undefined => {
    const remapped = approvalIds.get(id);
    if (remapped) return remapped;
    return isUuid(id) ? id : undefined;
  };

  const touchesApproval = (from: string, to: string, rawFrom: string, rawTo: string): boolean =>
    approvalIds.has(rawFrom) ||
    approvalIds.has(rawTo) ||
    [...approvalIds.values()].includes(from) ||
    [...approvalIds.values()].includes(to);

  const out: GraphPatchOp[] = [];
  for (const op of ops) {
    if (op.op === 'add_node' && op.entity_type === 'approvals') {
      const raw = op.entity.approval_node_id;
      if (typeof raw !== 'string') continue;
      const approvalNodeId = approvalIds.get(raw);
      if (!approvalNodeId) continue;
      const entity: Record<string, unknown> = {
        ...op.entity,
        approval_node_id: approvalNodeId,
      };
      if (options.workflowId) entity.workflow_id = options.workflowId;
      out.push({ op: 'add_node', entity_type: 'approvals', entity });
      continue;
    }

    if (op.op !== 'connect_nodes' && op.op !== 'connect_nodes_labeled') continue;
    const from = resolve(op.from_entity_id);
    const to = resolve(op.to_entity_id);
    if (!from || !to) continue;
    if (!touchesApproval(from, to, op.from_entity_id, op.to_entity_id)) continue;
    if (op.op === 'connect_nodes') {
      out.push({ op: 'connect_nodes', from_entity_id: from, to_entity_id: to });
    } else {
      out.push({
        op: 'connect_nodes_labeled',
        from_entity_id: from,
        to_entity_id: to,
        label: op.label,
      });
    }
  }

  return out;
}
