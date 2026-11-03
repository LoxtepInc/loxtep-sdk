/**
 * CLI: loxtep approval add
 *
 * Inserts one approval node after an existing graph node and splices that
 * node's direct children onto the approved path.
 *
 *   loxtep approval add --workflow <id> --after <entity-id> --name <name>
 *     --channel <channel> --timeout-hours <n> [--project-id <id>]
 */

import { randomUUID } from 'node:crypto';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { CliResult } from '../project-context.js';
import { isUuid } from '../../authoring/approval-graph-patch.js';

export interface ApprovalAddOptions {
  workflowId?: string;
  after?: string;
  name?: string;
  channel?: string;
  timeoutHours?: string;
  projectId?: string;
  organizationId?: string;
}

const USAGE =
  'Usage: loxtep approval add --workflow <id> --after <entity-id> --name <name> --channel <channel> --timeout-hours <n> [--project-id <id>]';

function readUpstreamId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if (typeof record.upstream_entity_id === 'string' && record.upstream_entity_id.trim() !== '') {
    return record.upstream_entity_id;
  }
  if (typeof record.upstreamEntityId === 'string' && record.upstreamEntityId.trim() !== '') {
    return record.upstreamEntityId;
  }
  const data = record.data;
  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>;
    const raw = nested.upstream_entity_id ?? nested.upstreamEntityId;
    if (typeof raw === 'string' && raw.trim() !== '') return raw;
  }
  return null;
}

function nodeIdOf(id: string, node: unknown): string {
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const explicit = record.entity_id ?? record.node_id ?? record.id;
    if (typeof explicit === 'string' && explicit.trim() !== '') return explicit;
  }
  return id;
}

function entityTypeOf(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const record = node as Record<string, unknown>;
  const direct = record.entity_type ?? record.entityType ?? record.type;
  if (typeof direct === 'string' && direct.trim() !== '') return direct;
  const data = record.data;
  if (data && typeof data === 'object') {
    const nested = (data as Record<string, unknown>).entity_type;
    if (typeof nested === 'string' && nested.trim() !== '') return nested;
  }
  return undefined;
}

export function directDownstreamEntityIds(graph: unknown, upstreamEntityId: string): string[] {
  if (!graph || typeof graph !== 'object') return [];
  const nodes = (graph as { nodes?: unknown }).nodes;
  if (nodes && typeof nodes === 'object' && !Array.isArray(nodes)) {
    const ids: string[] = [];
    for (const [key, node] of Object.entries(nodes as Record<string, unknown>)) {
      if (readUpstreamId(node) === upstreamEntityId) ids.push(nodeIdOf(key, node));
    }
    return ids;
  }
  if (Array.isArray(nodes)) {
    const ids: string[] = [];
    for (const node of nodes) {
      if (readUpstreamId(node) === upstreamEntityId) ids.push(nodeIdOf('', node));
    }
    return ids.filter((id) => id !== '');
  }
  const edges = (graph as { edges?: unknown }).edges;
  if (!Array.isArray(edges)) return [];
  const ids: string[] = [];
  for (const edge of edges) {
    if (!edge || typeof edge !== 'object') continue;
    const record = edge as Record<string, unknown>;
    const from = record.from ?? record.source_node_id ?? record.source;
    const to = record.to ?? record.target_node_id ?? record.target;
    if (from === upstreamEntityId && typeof to === 'string') ids.push(to);
  }
  return ids;
}

function findNode(graph: unknown, entityId: string): unknown {
  if (!graph || typeof graph !== 'object') return undefined;
  const nodes = (graph as { nodes?: unknown }).nodes;
  if (nodes && typeof nodes === 'object' && !Array.isArray(nodes)) {
    const record = nodes as Record<string, unknown>;
    if (record[entityId]) return record[entityId];
    return Object.values(record).find((node) => nodeIdOf('', node) === entityId);
  }
  if (Array.isArray(nodes)) {
    return nodes.find((node) => nodeIdOf('', node) === entityId);
  }
  return undefined;
}

export function buildApprovalAddOps(input: {
  workflowId: string;
  after: string;
  name: string;
  channel: string;
  timeoutHours: number;
  downstreamEntityIds: string[];
  upstreamEntityType?: string;
  projectId?: string;
  organizationId?: string;
  approvalNodeId?: string;
  now?: string;
}): Array<Record<string, unknown>> {
  const approvalNodeId = input.approvalNodeId ?? randomUUID();
  const now = input.now ?? new Date().toISOString();
  const entity: Record<string, unknown> = {
    approval_node_id: approvalNodeId,
    workflow_id: input.workflowId,
    name: input.name,
    approval_channel: input.channel,
    timeout_hours: input.timeoutHours,
    upstream_entity_id: input.after,
    created_at: now,
    updated_at: now,
  };
  if (input.upstreamEntityType) entity.upstream_entity_type = input.upstreamEntityType;
  if (input.projectId) entity.project_id = input.projectId;
  if (input.organizationId) entity.organization_id = input.organizationId;

  const ops: Array<Record<string, unknown>> = [
    { op: 'add_node', entity_type: 'approvals', entity },
    { op: 'connect_nodes', from_entity_id: input.after, to_entity_id: approvalNodeId },
  ];
  for (const downstreamId of input.downstreamEntityIds) {
    ops.push({
      op: 'connect_nodes_labeled',
      from_entity_id: approvalNodeId,
      to_entity_id: downstreamId,
      label: 'approved',
    });
  }
  return ops;
}

export async function runApprovalAddCommand(
  client: LoxtepClient,
  options: ApprovalAddOptions,
): Promise<CliResult> {
  const workflowId = options.workflowId?.trim();
  const after = options.after?.trim();
  const name = options.name?.trim();
  const channel = options.channel?.trim();
  const projectId = options.projectId?.trim();
  if (!workflowId || !after || !name || !channel || !options.timeoutHours || !projectId) {
    return { exitCode: 1, stdout: [], stderr: [USAGE] };
  }
  if (!isUuid(workflowId)) {
    return { exitCode: 1, stdout: [], stderr: [`--workflow must be a UUID. Got '${workflowId}'.`] };
  }
  if (!isUuid(after)) {
    return { exitCode: 1, stdout: [], stderr: [`--after must be a UUID. Got '${after}'.`] };
  }
  if (name.length > 128) {
    return { exitCode: 1, stdout: [], stderr: ['--name must be 1–128 characters.'] };
  }
  if (channel.length > 256) {
    return { exitCode: 1, stdout: [], stderr: ['--channel must be 1–256 characters.'] };
  }
  const timeoutHours = Number(options.timeoutHours);
  if (!Number.isInteger(timeoutHours) || timeoutHours < 1 || timeoutHours > 168) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`--timeout-hours must be an integer from 1 to 168. Got '${options.timeoutHours}'.`],
    };
  }

  try {
    const graph = await client.build.workflows.get_graph(workflowId, projectId);
    const parent = findNode(graph, after);
    if (!parent) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: [`No node ${after} on workflow ${workflowId}.`],
      };
    }
    const downstream = directDownstreamEntityIds(graph, after).filter((id) => isUuid(id));
    const ops = buildApprovalAddOps({
      workflowId,
      after,
      name,
      channel,
      timeoutHours,
      downstreamEntityIds: downstream,
      upstreamEntityType: entityTypeOf(parent),
      projectId,
      organizationId: options.organizationId,
    });
    await client.build.workflows.patch_graph(workflowId, projectId, { operations: ops });
    const approval = ops[0]?.entity as { approval_node_id?: string } | undefined;
    return {
      exitCode: 0,
      stdout: [`Approval ${approval?.approval_node_id ?? ''} added after ${after}.`],
      stderr: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [message] };
  }
}
