import { jest } from '@jest/globals';
import type { LoxtepStreamRuntime } from '../rstreams/leo-runtime.js';
import { LoxtepClient } from './loxtep-client.js';

describe('LoxtepClient', () => {
  it('should accept typed options and set api_url, auth, organization_id, project_id', () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.loxtep.com',
      auth: { type: 'jwt', token: 'fake-token' },
      organization_id: 'org-123',
      project_id: 'proj-456',
      metrics: { enabled: true, reporter: 'aws' },
    });
    expect(client.api_url).toBe('https://api.loxtep.com');
    expect(client.auth).toEqual({ type: 'jwt', token: 'fake-token' });
    expect(client.organization_id).toBe('org-123');
    expect(client.project_id).toBe('proj-456');
    expect(client.metrics).toBeDefined();
    expect(typeof client.metrics.log).toBe('function');
    expect(typeof client.metrics.get_reporter).toBe('function');
  });

  it('should expose ten MCP-aligned namespaces plus top-level I/O', () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
    });
    expect(client.session).toBeDefined();
    expect(client.connect).toBeDefined();
    expect(client.workspace).toBeDefined();
    expect(client.build).toBeDefined();
    expect(client.define).toBeDefined();
    expect(client.meaning).toBeDefined();
    expect(client.review).toBeDefined();
    expect(client.query).toBeDefined();
    expect(client.observe).toBeDefined();
    expect(client.context).toBeDefined();
    expect(typeof client.get_writer).toBe('function');
    expect(typeof client.get_reader).toBe('function');
  });

  it('greenfield surface: old flat namespaces removed', () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
    }) as unknown as Record<string, unknown>;

    expect(client.data_products).toBeUndefined();
    expect(client.workflows).toBeUndefined();
    expect(client.triggers).toBeUndefined();
    expect(client.projects).toBeUndefined();
    expect(client.connectors).toBeUndefined();
    expect(client.queues).toBeUndefined();
    expect(client.domains).toBeUndefined();
    expect(client.flows).toBeUndefined();
    expect(client.connections).toBeUndefined();
  });

  it('reflects the redesigned surface: nested APIs and snake_case methods', () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
    }) as unknown as Record<string, unknown>;

    const build = client.build as Record<string, unknown>;
    expect(build.triggers).toBeDefined();
    expect(build.targets).toBeDefined();
    expect(build.workflows).toBeDefined();

    const workflows = build.workflows as Record<string, unknown>;
    expect(typeof workflows.list).toBe('function');
    expect(typeof workflows.get_graph).toBe('function');
    expect(typeof workflows.get_writer).toBe('function');
    expect(workflows.listWorkflows).toBeUndefined();

    const discovery = (client.query as Record<string, unknown>).discovery as Record<string, unknown>;
    expect(typeof discovery.get_evidence).toBe('function');
    expect(typeof discovery.get_lineage_impact).toBe('function');
    expect(typeof discovery.get_governance_flags).toBe('function');
    expect(typeof discovery.run).toBe('function');

    const connectors = (client.connect as Record<string, unknown>).connectors as Record<string, unknown>;
    expect(typeof connectors.get_oauth_url).toBe('function');

    const projects = (client.workspace as Record<string, unknown>).projects as Record<string, unknown>;
    expect(typeof projects.apply_template).toBe('function');

    const thesaurus = (client.meaning as Record<string, unknown>).thesaurus as Record<string, unknown>;
    expect(typeof thesaurus.list_terms).toBe('function');
    expect(typeof thesaurus.resolve_canonical_key).toBe('function');

    const dataProducts = build.data_products as Record<string, unknown>;
    expect(typeof dataProducts.get_usage_map).toBe('function');
    expect(typeof client.build.get_writer).toBe('function');
  });

  it('observe.stream_config calls GET /observe/stream-config', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string) => {
        if (url.includes('/observe/stream-config')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: { Region: 'us-east-1', LeoEvent: 'events-table' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    const data = await client.observe.stream_config();
    expect(data).toEqual({ Region: 'us-east-1', LeoEvent: 'events-table' });
  });

  it('should not expose client.analytics', () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
    });
    expect((client as Record<string, unknown>).analytics).toBeUndefined();
  });

  it('should strip trailing slash from api_url', () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com/',
      auth: { type: 'jwt', token: 'x' },
    });
    expect(client.api_url).toBe('https://api.example.com');
  });

  it('data_products.get calls GET /dataproducts/:id and returns data when fetch is mocked', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const mockData = {
      data_product_id: id,
      name: 'Test Asset',
      organization_id: 'org-1',
      domain_id: 'dom-1',
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () =>
        new Response(JSON.stringify({ success: true, data: mockData }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const result = await client.build.data_products.get(id);
    expect(result.data_product_id).toBe(id);
    expect(result.name).toBe('Test Asset');
  });

  it('data_products.list returns items and pagination when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [{ data_product_id: 'id-1', name: 'A', status: 'active' }],
              pagination: {
                page: 1,
                page_size: 20,
                total: 1,
                total_pages: 1,
                has_next: false,
                has_prev: false,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    const result = await client.build.data_products.list({ page_size: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('A');
    expect(result.pagination.total).toBe(1);
  });

  it('data_products.search returns results when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () =>
        new Response(
          JSON.stringify({
            results: [{ id: 'dp-1', type: 'data_product', name: 'My Asset' }],
            totalCount: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    const result = await client.build.data_products.search('test');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe('data_product');
    expect(result.totalCount).toBe(1);
  });

  it('domains.list returns items and pagination when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  domain_id: 'dom-1',
                  organization_id: 'org-1',
                  name: 'Sales',
                  is_council: false,
                  metadata: {},
                  created_at: '2025-01-01T00:00:00Z',
                  updated_at: '2025-01-01T00:00:00Z',
                },
              ],
              pagination: {
                page: 1,
                page_size: 50,
                total: 1,
                total_pages: 1,
                has_next: false,
                has_prev: false,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    const result = await client.define.domains.list();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].domain_id).toBe('dom-1');
    expect(result.items[0].name).toBe('Sales');
    expect(result.pagination.total).toBe(1);
  });

  it('domains.get returns domain when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              domain_id: 'dom-1',
              organization_id: 'org-1',
              name: 'Sales',
              is_council: false,
              metadata: {},
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    const result = await client.define.domains.get('dom-1');
    expect(result.domain_id).toBe('dom-1');
    expect(result.name).toBe('Sales');
  });

  it('standards.list returns items and pagination when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  standard_id: 'std-1',
                  organization_id: 'org-1',
                  name: 'Freshness',
                  type: 'freshness',
                  threshold: 99,
                  unit: '%',
                  applies_to: [],
                  status: 'active',
                  created_at: '2025-01-01T00:00:00Z',
                  updated_at: '2025-01-01T00:00:00Z',
                },
              ],
              pagination: {
                page: 1,
                page_size: 50,
                total: 1,
                total_pages: 1,
                has_next: false,
                has_prev: false,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    const result = await client.define.standards.list();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].standard_id).toBe('std-1');
    expect(result.items[0].name).toBe('Freshness');
    expect(result.pagination.total).toBe(1);
  });

  it('standards.get returns standard when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              standard_id: 'std-1',
              organization_id: 'org-1',
              name: 'Freshness',
              type: 'freshness',
              threshold: 99,
              unit: '%',
              applies_to: [],
              status: 'active',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    const result = await client.define.standards.get('std-1');
    expect(result.standard_id).toBe('std-1');
    expect(result.name).toBe('Freshness');
  });

  it('data_contracts.list returns items and pagination when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  contract_id: 'ct-1',
                  data_product_id: 'dp-1',
                  name: 'SLA',
                  version: '1.0',
                  status: 'active',
                  guarantees: {},
                  sla_definitions: [],
                  sla: {},
                  created_at: '2025-01-01T00:00:00Z',
                  updated_at: '2025-01-01T00:00:00Z',
                  created_by: 'user-1',
                },
              ],
              pagination: {
                page: 1,
                page_size: 20,
                total: 1,
                total_pages: 1,
                has_next: false,
                has_prev: false,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    const result = await client.define.data_contracts.list();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].contract_id).toBe('ct-1');
    expect(result.items[0].name).toBe('SLA');
    expect(result.pagination.total).toBe(1);
  });

  it('data_contracts.get returns contract when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              contract_id: 'ct-1',
              data_product_id: 'dp-1',
              name: 'SLA',
              version: '1.0',
              status: 'active',
              guarantees: {},
              sla_definitions: [],
              sla: {},
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              created_by: 'user-1',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });
    const result = await client.define.data_contracts.get('ct-1');
    expect(result.contract_id).toBe('ct-1');
    expect(result.name).toBe('SLA');
  });

  it('connections.create returns connection when fetch is mocked', async () => {
    const mockConnection = {
      connection_id: '550e8400-e29b-41d4-a716-446655440000',
      key: 'my-conn',
      name: 'My Connection',
      type: 'api',
      status: 'active',
      data: '',
      configuration: {},
      metadata: {},
      verified: false,
      draft: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string | URL | Request, init?: RequestInit) => {
        const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (
          u.includes('/workflows/projects/') &&
          u.includes('/entities/connections/') &&
          (init?.method === 'PUT' || init?.method === 'put')
        ) {
          return new Response(JSON.stringify({ success: true, data: mockConnection }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    const result = await client.build.triggers.create({
      project_id: 'proj-1',
      workflow_id: 'wf-1',
      key: 'my-conn',
      name: 'My Connection',
      type: 'api',
    });
    expect(result.connection_id).toBe(mockConnection.connection_id);
    expect(result.name).toBe('My Connection');
    expect(result.type).toBe('api');
  });

  it('flows.list returns items and pagination when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string | URL | Request) => {
        const u =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : (url as Request).url;
        if (u.includes('/workflows/workflows?') && u.includes('project_id=')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                items: [
                  {
                    workflow_id: 'flow-1',
                    project_id: 'proj-1',
                    name: 'My Flow',
                    status: 'active',
                    configuration: {},
                    deployment: {},
                    metrics: {},
                    created_at: '2025-01-01T00:00:00Z',
                    updated_at: '2025-01-01T00:00:00Z',
                  },
                ],
                pagination: {
                  page: 1,
                  page_size: 100,
                  total: 1,
                  total_pages: 1,
                  has_next: false,
                  has_prev: false,
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    const result = await client.build.workflows.list({ project_id: 'proj-1' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('My Flow');
    expect(result.pagination.total).toBe(1);
  });

  it('flows.get returns flow with nodes when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string | URL | Request) => {
        const u =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : (url as Request).url;
        if (u.endsWith('/workflows/workflows/flow-1')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                workflow_id: 'flow-1',
                project_id: 'proj-1',
                name: 'My Flow',
                status: 'active',
                configuration: {},
                deployment: {},
                metrics: {},
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-01T00:00:00Z',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (u.endsWith('/workflows/workflows/flow-1/nodes')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                items: [
                  {
                    node_id: 'node-1',
                    workflow_id: 'flow-1',
                    name: 'Ingest',
                    type: 'ingestion',
                    created_at: '2025-01-01T00:00:00Z',
                    updated_at: '2025-01-01T00:00:00Z',
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    const result = await client.build.workflows.get('flow-1');
    expect(result.workflow_id).toBe('flow-1');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe('Ingest');
  });

  it('flows.get_writer returns writer with write and close', async () => {
    const written: unknown[] = [];
    const stream = {
      write(chunk: unknown) {
        written.push(chunk);
        return true;
      },
      end(cb: (err?: unknown) => void) {
        cb();
      },
    };
    const rsdk = { load: () => stream } as unknown as LoxtepStreamRuntime;
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      streams_sdk: rsdk,
      fetch_fn: async () => new Response(JSON.stringify({}), { status: 404 }),
    });
    const writer = await client.build.workflows.get_writer('flow-1', {
      bot_id: 'bot-1',
      project_id: 'proj-123',
      output_queue_name: 'dev-app-ingest',
    });
    expect(writer.write).toBeDefined();
    expect(writer.close).toBeDefined();
    writer.write({ id: 'e1', payload: {} });
    await writer.close();
    expect(written).toHaveLength(1);
  });

  it('flows.get_writer with validate_definition reject throws DefinitionValidationError', async () => {
    const stream = {
      write() {
        return true;
      },
      end(cb: (err?: unknown) => void) {
        cb();
      },
    };
    const rsdk = { load: () => stream } as unknown as LoxtepStreamRuntime;
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      streams_sdk: rsdk,
    });
    const writer = await client.build.workflows.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'dev-app-ingest',
      validate_definition: true,
      on_validation_error: 'reject',
      definition: { required: ['id'] },
    });
    try {
      writer.write({});
    } catch (e: unknown) {
      const err = e as {
        name: string;
        validation_errors: Array<{ path?: string; message: string }>;
      };
      expect(err.name).toBe('DefinitionValidationError');
      expect(err.validation_errors).toHaveLength(1);
      expect(err.validation_errors[0].path).toBe('id');
      expect(err.validation_errors[0].message).toContain('id');
      return;
    }
    throw new Error('Expected DefinitionValidationError');
  });

  it('connections.list returns items and pagination when fetch is mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string | URL | Request) => {
        const u =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : (url as Request).url;
        if (u.includes('/workflows/projects/') && u.includes('/entities') && !u.includes('/connections/')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                connections: [
                  {
                    connection_id: 'conn-1',
                    key: 'k1',
                    name: 'Conn 1',
                    type: 'webhook',
                    status: 'active',
                    data: '',
                    configuration: {},
                    metadata: {},
                    verified: false,
                    draft: false,
                    created_at: '2025-01-01T00:00:00Z',
                    updated_at: '2025-01-01T00:00:00Z',
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    const result = await client.build.triggers.list({ project_id: 'proj-1', page_size: 50 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Conn 1');
    expect(result.pagination.total).toBe(1);
  });

  it('data_products.query returns items and metadata when fetch is mocked', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        if (
          url.includes('/dataproducts/warehouse/execute') &&
          Array.isArray(body.data_product_ids_hint) &&
          body.data_product_ids_hint.includes(id)
        ) {
          return new Response(
            JSON.stringify({
              status: 'completed',
              rows: [{ col1: 'a', col2: 1 }],
              row_count: 1,
              total_count: 1,
              execution_time_ms: 10,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 400 });
      },
    });
    const result = await client.build.data_products.query(id, 'SELECT * FROM t LIMIT 1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ col1: 'a', col2: 1 });
    expect(result.metadata.data_product_id).toBe(id);
    expect(result.metadata.returned_rows).toBe(1);
  });

  it('data_products.list_tables returns items when fetch is mocked', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string) => {
        if (url.includes('/dataproducts/warehouse/tables')) {
          return new Response(
            JSON.stringify({
              tables: [
                {
                  name: 'events',
                  sql_name: 'events',
                  data_product_id: id,
                  medallion: 'public',
                },
              ],
              count: 1,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    const result = await client.build.data_products.list_tables(id);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('events');
    expect(result.items[0].schema).toBe('public');
  });

  it('get_rate_limits returns null when no endpoint and no prior response', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async () => new Response(JSON.stringify({}), { status: 404 }),
    });
    const result = await client.get_rate_limits();
    expect(result).toBeNull();
  });

  it('get_rate_limits returns data from GET /rate-limits when mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string) => {
        if (url.includes('/rate-limits')) {
          return new Response(
            JSON.stringify({
              limit: 100,
              remaining: 95,
              reset_at: '2025-02-01T00:00:00Z',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({}), { status: 404 });
      },
    });
    const result = await client.get_rate_limits();
    expect(result).not.toBeNull();
    expect(result!.limit).toBe(100);
    expect(result!.remaining).toBe(95);
    expect(result!.reset_at).toBe('2025-02-01T00:00:00Z');
  });

  it('metrics.log and get_reporter exist and do not throw', () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
    });
    expect(() => client.metrics.log({ id: 'test.metric', value: 1 })).not.toThrow();
    expect(client.metrics.get_reporter()).toBeNull();
  });

  it('queues.open_reader returns handle and read yields events when stream runtime is mocked', async () => {
    const queueName = 'dev-app-notification-requested';
    const rsdk = {
      offloadEvents: jest.fn(
        async (opts: { transform: (p: unknown, w: unknown, cb?: () => void) => void }) => {
          opts.transform(undefined, { id: 'e1', payload: { x: 1 } }, () => undefined);
          opts.transform(undefined, { id: 'e2', payload: { x: 2 } }, () => undefined);
        }
      ),
    } as unknown as LoxtepStreamRuntime;
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      streams_sdk: rsdk,
      fetch_fn: async () => new Response(JSON.stringify({}), { status: 404 }),
    });
    const reader = await client.observe.open_reader({
      bot_id: 'dev-bot-process',
      queue_name: queueName,
    });
    const events: unknown[] = [];
    for await (const event of reader.read({ batch_size: 10 })) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect((events[0] as { event_id: string }).event_id).toBe('e1');
    expect((events[1] as { event_id: string }).event_id).toBe('e2');
  });

  it('queues.open_writer returns handle and writes envelopes to the load stream', async () => {
    const written: unknown[] = [];
    const stream = {
      write(chunk: unknown) {
        written.push(chunk);
        return true;
      },
      end(cb: (err?: unknown) => void) {
        cb();
      },
    };
    const rsdk = { load: () => stream } as unknown as LoxtepStreamRuntime;
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      streams_sdk: rsdk,
      fetch_fn: async () => new Response(JSON.stringify({}), { status: 404 }),
    });
    const writer = await client.observe.open_writer({
      bot_id: 'dev-bot-process',
      queue_name: 'dev-app-queue',
    });
    writer.write({ foo: 'bar' });
    await writer.close();
    expect(written).toEqual([{ payload: { foo: 'bar' } }]);
  });

  it('quality.list returns items when fetch mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string) => {
        if (url.includes('/dataproducts/quality-metrics')) {
          return new Response(
            JSON.stringify({
              items: [{ metric_id: 'm1', data_product_id: 'dp1', value: 0.95 }],
              pagination: {
                page: 1,
                page_size: 20,
                total: 1,
                total_pages: 1,
                has_next: false,
                has_prev: false,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({}), { status: 404 });
      },
    });
    const result = await client.define.quality.list({
      data_product_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].metric_id).toBe('m1');
  });

  it('catalog.search returns results when fetch mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string) => {
        if (url.includes('/search')) {
          return new Response(
            JSON.stringify({
              results: [{ id: '1', type: 'data_product', name: 'Test' }],
              totalCount: 1,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({}), { status: 404 });
      },
    });
    const result = await client.query.catalog.search('test');
    expect(result.results).toHaveLength(1);
    expect(result.results![0].name).toBe('Test');
  });

  it('quality.create returns metric when fetch mocked', async () => {
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string, init?: RequestInit) => {
        if (url.includes('/dataproducts/quality-metrics') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              metric: {
                metric_id: 'm-new',
                data_product_id: '550e8400-e29b-41d4-a716-446655440000',
                metric_type: 'completeness',
                value: 0.98,
                status: 'pass',
              },
              message: 'Quality metric recorded successfully',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({}), { status: 404 });
      },
    });
    const result = await client.define.quality.create({
      data_product_id: '550e8400-e29b-41d4-a716-446655440000',
      metric_type: 'completeness',
      value: 0.98,
    });
    expect(result.metric_id).toBe('m-new');
    expect(result.value).toBe(0.98);
  });

  it('schemas.get returns schema when fetch mocked', async () => {
    const dpId = '550e8400-e29b-41d4-a716-446655440000';
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string) => {
        if (url.includes(`/dataproducts/${dpId}`)) {
          return new Response(JSON.stringify({ schema: { version: '1.0', fields: [] } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({}), { status: 404 });
      },
    });
    const result = await client.define.schemas.get(dpId);
    expect(result).not.toBeNull();
    expect(result!.version).toBe('1.0');
  });

  it('schemas.list returns schema versions when fetch mocked', async () => {
    const dpId = '550e8400-e29b-41d4-a716-446655440000';
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'x' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string) => {
        if (url.includes(`/dataproducts/${dpId}`)) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                schema: {
                  versions: [
                    {
                      schema_version_id: 'sv1',
                      version: '1.0.0',
                      version_number: 1,
                      status: 'active',
                    },
                  ],
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({}), { status: 404 });
      },
    });
    const result = await client.define.schemas.list(dpId);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].schema_version_id).toBe('sv1');
    expect(result.items[0].version).toBe('1.0.0');
  });
});
