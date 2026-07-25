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

/** Platform list endpoints cap `page_size` at 100; requesting more is a validation error. */
const MAX_PAGE_SIZE = 100;

/**
 * Fetch every page from a `list()`-style API and return the flattened items.
 * Stops once a page comes back shorter than `MAX_PAGE_SIZE` (i.e. the last page).
 */
async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[] }>
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  for (;;) {
    const { items } = await fetchPage(page);
    all.push(...items);
    if (items.length < MAX_PAGE_SIZE) break;
    page += 1;
  }
  return all;
}

/**
 * Fetch all workspace resources from the control plane and assemble them into
 * a WorkspaceContext. The client must be configured with a valid project_id.
 *
 * List calls are paginated at the platform's max page size (100) and looped
 * until a short page is returned, so the full resource set is fetched
 * regardless of how many pages it spans.
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
  const [dataProductsItems, connectorsItems, domainsItems, workflowItems] = await Promise.all([
    fetchAllPages(page =>
      client.build.data_products.list({ page, page_size: MAX_PAGE_SIZE })
    ),
    fetchAllPages(page =>
      client.connect.connectors.list({ page, page_size: MAX_PAGE_SIZE })
    ),
    fetchAllPages(page => client.define.domains.list({ page, page_size: MAX_PAGE_SIZE })),
    fetchAllPages(page =>
      client.build.workflows.list({ project_id: projectId, page, page_size: MAX_PAGE_SIZE })
    ),
  ]);
  // `flows` and `workflows` are the same backend entity; the WorkspaceContext
  // keeps both collections for the generated artifact, sourced from one fetch.
  const flowItems = workflowItems;

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
  const dataProducts: WorkspaceContext['dataProducts'] = dataProductsItems.map(dp => ({
    name: dp.name,
    id: dp.data_product_id,
    domain: dp.domain_id ?? null,
    schema: (dp.schema as WorkspaceContext['dataProducts'][number]['schema']) ?? null,
  }));

  // Map connectors to workspace context shape
  const connectors: WorkspaceContext['connectors'] = connectorsItems.map(c => ({
    type: c.connector_type,
    id: c.connector_id,
    connection_id: null, // Connectors at org-level don't have a project connection_id
    name: c.metadata?.name as string ?? c.connector_type,
  }));

  // Map domains to workspace context shape
  const domains: WorkspaceContext['domains'] = domainsItems.map(d => ({
    name: d.name,
    id: d.domain_id,
    data_product_ids: dataProducts
      .filter(dp => dp.domain === d.domain_id)
      .map(dp => dp.id),
  }));

  // Map flows to workspace context shape
  const flows: WorkspaceContext['flows'] = flowItems.map(f => ({
    name: f.name,
    id: f.workflow_id,
  }));

  // Map workflows to workspace context shape
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
