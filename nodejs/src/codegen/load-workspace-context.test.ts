import { loadWorkspaceContext } from './load-workspace-context.js';
import { LoxtepClient } from '../client/loxtep-client.js';
import type { WorkspaceContext } from './types.js';

/**
 * Creates a LoxtepClient with a mocked fetch_fn that responds to the expected
 * API endpoints with the given test data.
 */
function createMockClient(opts: {
  dataProducts?: Array<{
    data_product_id: string;
    name: string;
    domain_id?: string;
    schema?: Record<string, unknown>;
  }>;
  connectors?: Array<{
    connector_id: string;
    connector_type: string;
    metadata: Record<string, unknown>;
  }>;
  domains?: Array<{
    domain_id: string;
    name: string;
  }>;
  flows?: Array<{
    workflow_id: string;
    name: string;
  }>;
  workflows?: Array<{
    workflow_id: string;
    name: string;
  }>;
  observeData?: unknown;
  failEndpoint?: string;
}): LoxtepClient {
  const {
    dataProducts = [],
    connectors = [],
    domains = [],
    flows = [],
    workflows = [],
    observeData = { bots: [], queues: [] },
    failEndpoint,
  } = opts;

  return new LoxtepClient({
    url_resolution: 'legacy',
    api_url: 'https://api.example.com',
    auth: { type: 'jwt', token: 'test-token' },
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    fetch_fn: async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (failEndpoint && u.includes(failEndpoint)) {
        return new Response(JSON.stringify({ error: 'Service unavailable' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Data products list
      if (u.includes('/dataproducts') && !u.includes('/query') && !u.includes('/tables')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              items: dataProducts.map(dp => ({
                ...dp,
                organization_id: 'org-1',
                kind: 'source',
                description: '',
                status: 'active',
                owner: { user_id: 'u-1' },
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-01T00:00:00Z',
              })),
              pagination: {
                page: 1,
                page_size: 1000,
                total: dataProducts.length,
                total_pages: 1,
                has_next: false,
                has_prev: false,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Connectors list
      if (u.includes('/connectors/connectors')) {
        return new Response(
          JSON.stringify({
            success: true,
            items: connectors.map(c => ({
              ...c,
              owner_user_id: 'u-1',
              organization_id: 'org-1',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            })),
            pagination: {
              page: 1,
              page_size: 1000,
              total: connectors.length,
              total_pages: 1,
              has_next: false,
              has_prev: false,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Domains list
      if (u.includes('/organizations/domains')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              items: domains.map(d => ({
                ...d,
                organization_id: 'org-1',
                is_council: false,
                metadata: {},
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-01T00:00:00Z',
              })),
              pagination: {
                page: 1,
                page_size: 1000,
                total: domains.length,
                total_pages: 1,
                has_next: false,
                has_prev: false,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Flows and Workflows list (both use /workflows/workflows)
      if (u.includes('/workflows/workflows')) {
        // Determine if it's fetching flows or workflows based on call order
        // Both use the same endpoint but with project_id filter
        // The first call is flows, the second is workflows
        // We differentiate by tracking calls or by using the same data
        // For testing, we return flows for the first call and workflows for the second
        // Since both endpoints are the same, we'll return a combined response
        // that gets mapped appropriately by the loader

        // Actually, both flows.list and workflows.listWorkflows hit the same endpoint
        // with the same query params. The loader calls both. We need to return
        // the right data each time. Since fetch_fn is stateless, we'll just return
        // both sets combined — the loader will call it twice and get the same response.
        // In practice the backend differentiates (or they're the same resource viewed differently).
        // For the test, we'll return all items (flows + workflows) and the loader
        // maps them identically.
        const allItems = [...flows, ...workflows].map(w => ({
          ...w,
          project_id: 'proj-1',
          status: 'active',
          configuration: {},
          deployment: {},
          metrics: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        }));
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              items: allItems,
              pagination: {
                page: 1,
                page_size: 1000,
                total: allItems.length,
                total_pages: 1,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Observe bots (for queues)
      if (u.includes('/observe/bots')) {
        return new Response(
          JSON.stringify({ success: true, data: observeData }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ success: false }), { status: 404 });
    },
  });
}

describe('loadWorkspaceContext', () => {
  it('returns a WorkspaceContext with all resource types populated', async () => {
    const client = createMockClient({
      dataProducts: [
        { data_product_id: 'dp-1', name: 'orders', domain_id: 'dom-1', schema: { type: 'object' } },
        { data_product_id: 'dp-2', name: 'customers', domain_id: 'dom-1' },
      ],
      connectors: [
        { connector_id: 'cn-1', connector_type: 'shopify', metadata: { name: 'Shopify Main' } },
      ],
      domains: [
        { domain_id: 'dom-1', name: 'commerce' },
      ],
      flows: [
        { workflow_id: 'fl-1', name: 'ingest-orders' },
      ],
      workflows: [
        { workflow_id: 'wf-1', name: 'process-orders' },
      ],
      observeData: {
        queues: [
          { queue_name: 'orders-raw', queue_id: 'q-1' },
          { queue_name: 'orders-processed', queue_id: 'q-2' },
        ],
      },
    });

    const ctx = await loadWorkspaceContext(client, 'proj-1');

    // Verify data products
    expect(ctx.dataProducts).toHaveLength(2);
    expect(ctx.dataProducts[0]).toEqual({
      name: 'orders',
      id: 'dp-1',
      domain: 'dom-1',
      schema: { type: 'object' },
    });
    expect(ctx.dataProducts[1]).toEqual({
      name: 'customers',
      id: 'dp-2',
      domain: 'dom-1',
      schema: null,
    });

    // Verify connectors
    expect(ctx.connectors).toHaveLength(1);
    expect(ctx.connectors[0]).toEqual({
      type: 'shopify',
      id: 'cn-1',
      connection_id: null,
      name: 'Shopify Main',
    });

    // Verify domains
    expect(ctx.domains).toHaveLength(1);
    expect(ctx.domains[0]).toEqual({
      name: 'commerce',
      id: 'dom-1',
      data_product_ids: ['dp-1', 'dp-2'],
    });

    // Verify queues
    expect(ctx.queues).toHaveLength(2);
    expect(ctx.queues[0]).toEqual({ name: 'orders-raw', id: 'q-1' });
    expect(ctx.queues[1]).toEqual({ name: 'orders-processed', id: 'q-2' });
  });

  it('returns empty arrays when no resources exist', async () => {
    const client = createMockClient({});

    const ctx = await loadWorkspaceContext(client, 'proj-empty');

    expect(ctx.dataProducts).toEqual([]);
    expect(ctx.connectors).toEqual([]);
    expect(ctx.domains).toEqual([]);
    expect(ctx.queues).toEqual([]);
    expect(ctx.flows).toEqual([]);
    expect(ctx.workflows).toEqual([]);
  });

  it('returns empty queues when observe endpoint fails', async () => {
    const client = createMockClient({
      dataProducts: [
        { data_product_id: 'dp-1', name: 'orders' },
      ],
      failEndpoint: '/observe',
    });

    const ctx = await loadWorkspaceContext(client, 'proj-1');

    expect(ctx.dataProducts).toHaveLength(1);
    expect(ctx.queues).toEqual([]);
  });

  it('throws when a required endpoint fails (data_products)', async () => {
    const client = createMockClient({
      failEndpoint: '/dataproducts',
    });

    await expect(loadWorkspaceContext(client, 'proj-1')).rejects.toThrow();
  });

  it('maps connector name from metadata.name falling back to connector_type', async () => {
    const client = createMockClient({
      connectors: [
        { connector_id: 'cn-1', connector_type: 'postgres', metadata: { name: 'Production DB' } },
        { connector_id: 'cn-2', connector_type: 'redis', metadata: {} },
      ],
    });

    const ctx = await loadWorkspaceContext(client, 'proj-1');

    expect(ctx.connectors[0].name).toBe('Production DB');
    expect(ctx.connectors[1].name).toBe('redis');
  });

  it('correctly associates data_product_ids to domains', async () => {
    const client = createMockClient({
      dataProducts: [
        { data_product_id: 'dp-1', name: 'orders', domain_id: 'dom-1' },
        { data_product_id: 'dp-2', name: 'customers', domain_id: 'dom-2' },
        { data_product_id: 'dp-3', name: 'products', domain_id: 'dom-1' },
        { data_product_id: 'dp-4', name: 'orphan' }, // no domain
      ],
      domains: [
        { domain_id: 'dom-1', name: 'commerce' },
        { domain_id: 'dom-2', name: 'crm' },
      ],
    });

    const ctx = await loadWorkspaceContext(client, 'proj-1');

    const commerce = ctx.domains.find(d => d.id === 'dom-1')!;
    const crm = ctx.domains.find(d => d.id === 'dom-2')!;

    expect(commerce.data_product_ids).toEqual(['dp-1', 'dp-3']);
    expect(crm.data_product_ids).toEqual(['dp-2']);
  });

  it('handles data products with null domain and schema', async () => {
    const client = createMockClient({
      dataProducts: [
        { data_product_id: 'dp-1', name: 'unowned' },
      ],
    });

    const ctx = await loadWorkspaceContext(client, 'proj-1');

    expect(ctx.dataProducts[0].domain).toBeNull();
    expect(ctx.dataProducts[0].schema).toBeNull();
  });

  it('extracts queues from observe data with queue_name/queue_id', async () => {
    const client = createMockClient({
      observeData: {
        queues: [
          { queue_name: 'q1', queue_id: 'id-1' },
          { name: 'q2', id: 'id-2' },
          { queue_name: 'q3' }, // no id, falls back to name
        ],
      },
    });

    const ctx = await loadWorkspaceContext(client, 'proj-1');

    expect(ctx.queues).toHaveLength(3);
    expect(ctx.queues[0]).toEqual({ name: 'q1', id: 'id-1' });
    expect(ctx.queues[1]).toEqual({ name: 'q2', id: 'id-2' });
    expect(ctx.queues[2]).toEqual({ name: 'q3', id: 'q3' });
  });

  it('conforms to the WorkspaceContext interface shape', async () => {
    const client = createMockClient({
      dataProducts: [{ data_product_id: 'dp-1', name: 'test', schema: { type: 'object', properties: { id: { type: 'string' } } } }],
      connectors: [{ connector_id: 'cn-1', connector_type: 'shopify', metadata: { name: 'Shop' } }],
      domains: [{ domain_id: 'dom-1', name: 'sales' }],
      flows: [{ workflow_id: 'fl-1', name: 'my-flow' }],
      workflows: [{ workflow_id: 'wf-1', name: 'my-workflow' }],
      observeData: { queues: [{ queue_name: 'events', queue_id: 'q-1' }] },
    });

    const ctx: WorkspaceContext = await loadWorkspaceContext(client, 'proj-1');

    // Type assertion ensures the shape is correct at compile time
    expect(ctx).toHaveProperty('dataProducts');
    expect(ctx).toHaveProperty('connectors');
    expect(ctx).toHaveProperty('domains');
    expect(ctx).toHaveProperty('queues');
    expect(ctx).toHaveProperty('flows');
    expect(ctx).toHaveProperty('workflows');
  });
});
