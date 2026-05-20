/**
 * Resolve default ingestion queue name from a flow + nodes (platform deployment pattern).
 */

import type { FlowWithNodes } from './flow-types.js';

/**
 * `{environmentPrefix}-workflow-{workflow_id}-ingestion-{node_id}` for the first ingestion node.
 */
export function resolveIngestionQueueName(
  flow: FlowWithNodes,
  environmentPrefix: string
): string | undefined {
  const prefix = environmentPrefix.replace(/\/$/, '');
  const ingest = flow.nodes?.find(n => n.type === 'ingestion');
  if (!ingest?.node_id) return undefined;
  const wid = flow.workflow_id;
  if (!wid) return undefined;
  return `${prefix}-workflow-${wid}-ingestion-${ingest.node_id}`;
}
