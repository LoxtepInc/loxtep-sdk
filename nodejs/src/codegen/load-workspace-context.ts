/**
 * Stage 1 (I/O): Load the raw WorkspaceContext from the control plane.
 *
 * Queries the Loxtep API via LoxtepClient namespaces scoped to the project_id:
 * - data_products (org-level, all available to the project)
 * - connectors (org-level)
 * - domains (org-level, with associated data product ids)
 * - queues (instance-level, from observe)
 * - flows (project-scoped)
 * - workflows (project-scoped)
 *
 * @module codegen/load-workspace-context
 */

import type { LoxtepClient } from '../client/loxtep-client.js';
import type { WorkspaceContext } from './types.js';

/**
 * Fetch all workspace resources from the control plane and assemble them into
 * a WorkspaceContext. The client must be configured with a valid project_id.
 *
 * All list calls use large page sizes to fetch the complete resource set.
 * Pagination is handled by fetching the maximum page size; projects with
 * extremely large resource counts may need future iteration.
 *
 * @param client - An authenticated LoxtepClient instance
 * @param projectId - The project to scope the context to
 * @returns The assembled WorkspaceContext with all resource collections
 * @throws If any control-plane query fails (caller should handle R2.8)
 */
export async function loadWorkspaceContext(
  client: LoxtepClient,
  projectId: string
): Promise<WorkspaceContext> {
  // Fetch all resource types concurrently for performance.
  // Project-scoped resources (workflows) use projectId directly.
  // Org-scoped resources (data products, connectors, domains) fetch all available.
  const [
    dataProductsResult,
    connectorsResult,
    domainsResult,
    workflowsResult,
  ] = await Promise.all([
    client.build.data_products.list({ page: 1, page_size: 1000 }),
    client.connect.connectors.list({ page: 1, page_size: 1000 }),
    client.define.domains.list({ page: 1, page_size: 1000 }),
    client.build.workflows.list({ project_id: projectId, page: 1, page_size: 1000 }),
  ]);
  // `flows` and `workflows` are the same backend entity; the WorkspaceContext
  // keeps both collections for the generated artifact, sourced from one fetch.
  const flowsResult = workflowsResult;

  // Fetch queues from the observe endpoint (instance-level).
  // The observe.status() returns bot/queue info for the configured instance.
  let queuesRaw: Array<{ name: string; id: string }> = [];
  try {
    const observeData = await client.observe.status();
    queuesRaw = extractQueuesFromObserve(observeData);
  } catch {
    // If observe is not available (e.g. no instance configured), queues will be empty.
    // This is acceptable — queues are instance-level and may not be reachable during
    // initial setup.
    queuesRaw = [];
  }

  // Map data products to workspace context shape
  const dataProducts: WorkspaceContext['dataProducts'] = (
    dataProductsResult?.items ?? []
  ).map(dp => ({
    name: dp.name,
    id: dp.data_product_id,
    domain: dp.domain_id ?? null,
    schema: (dp.schema as WorkspaceContext['dataProducts'][number]['schema']) ?? null,
  }));

  // Map connectors to workspace context shape
  const connectors: WorkspaceContext['connectors'] = (
    connectorsResult?.items ?? []
  ).map(c => ({
    type: c.connector_type,
    id: c.connector_id,
    connection_id: null, // Connectors at org-level don't have a project connection_id
    name: c.metadata?.name as string ?? c.connector_type,
  }));

  // Map domains to workspace context shape
  const domainsItems = domainsResult?.items ?? [];
  const domains: WorkspaceContext['domains'] = domainsItems.map(d => ({
    name: d.name,
    id: d.domain_id,
    data_product_ids: dataProducts
      .filter(dp => dp.domain === d.domain_id)
      .map(dp => dp.id),
  }));

  // Map flows to workspace context shape
  const flowItems = flowsResult?.items ?? [];
  const flows: WorkspaceContext['flows'] = flowItems.map(f => ({
    name: f.name,
    id: f.workflow_id,
  }));

  // Map workflows to workspace context shape
  const workflowItems = workflowsResult?.items ?? [];
  const workflows: WorkspaceContext['workflows'] = workflowItems.map(w => ({
    name: w.name,
    id: w.workflow_id,
  }));

  return {
    dataProducts,
    connectors,
    domains,
    queues: queuesRaw,
    flows,
    workflows,
  };
}

/**
 * Extract queue names and ids from the observe status response.
 * The observe endpoint returns various shapes; we extract queue-like entries
 * that have a name/queue_name and an identifier.
 */
function extractQueuesFromObserve(
  observeData: unknown
): Array<{ name: string; id: string }> {
  if (!observeData || typeof observeData !== 'object') return [];

  const data = observeData as Record<string, unknown>;

  // Try to extract queues from common observe response shapes
  const queuesArray =
    (data.queues as unknown[]) ??
    ((data as { data?: { queues?: unknown[] } }).data?.queues as unknown[]) ??
    [];

  if (!Array.isArray(queuesArray)) return [];

  const result: Array<{ name: string; id: string }> = [];
  for (const q of queuesArray) {
    if (!q || typeof q !== 'object') continue;
    const entry = q as Record<string, unknown>;
    const name =
      (entry.queue_name as string) ??
      (entry.name as string) ??
      '';
    const id =
      (entry.queue_id as string) ??
      (entry.id as string) ??
      '';
    if (name) {
      result.push({ name, id: id || name });
    }
  }

  return result;
}
