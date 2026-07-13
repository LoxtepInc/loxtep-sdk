import { createDiscoveryApi } from './discovery.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createDiscoveryApi', () => {
  it('search calls POST /ai/mcp/tools/call with name search_catalog and arguments', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true,
          data: {
            content: [{ type: 'text', text: JSON.stringify({ results: [], totalCount: 0 }) }],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createDiscoveryApi(http);
    await api.search({ query: 'customers', include_evidence: true });

    expect(capturedPath).toBe('/ai/mcp/tools/call');
    expect(capturedBody).toEqual({
      name: 'search_catalog',
      arguments: { query: 'customers', include_evidence: true },
    });
  });

  it('get_evidence calls POST with get_evidence and data_product_ids', async () => {
    let capturedBody: unknown = null;
    const http = {
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return {
          success: true,
          data: { content: [{ type: 'text', text: JSON.stringify({ evidence: [] }) }] },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createDiscoveryApi(http);
    await api.get_evidence(['id-1', 'id-2']);

    expect(capturedBody).toEqual({
      name: 'get_evidence',
      arguments: { data_product_ids: ['id-1', 'id-2'] },
    });
  });

  it('get_lineage_impact calls POST with get_lineage_impact and data_product_id', async () => {
    let capturedBody: unknown = null;
    const http = {
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return {
          success: true,
          data: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ data_product_id: 'dp-1', downstream_count: 5 }),
              },
            ],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createDiscoveryApi(http);
    await api.get_lineage_impact('dp-1');

    expect(capturedBody).toEqual({
      name: 'get_lineage_impact',
      arguments: { data_product_id: 'dp-1' },
    });
  });

  it('get_governance_flags calls POST with get_governance_flags', async () => {
    let capturedBody: unknown = null;
    const http = {
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return {
          success: true,
          data: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  data_product_id: 'dp-1',
                  classification: null,
                  pii_fields: null,
                }),
              },
            ],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createDiscoveryApi(http);
    await api.get_governance_flags('dp-1');

    expect(capturedBody).toEqual({
      name: 'get_governance_flags',
      arguments: { data_product_id: 'dp-1' },
    });
  });

  it('run calls POST with run_discovery and empty arguments', async () => {
    let capturedBody: unknown = null;
    const http = {
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return {
          success: true,
          data: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'Use search_catalog...',
                  tools: ['search_catalog', 'get_evidence'],
                }),
              },
            ],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createDiscoveryApi(http);
    await api.run();

    expect(capturedBody).toEqual({ name: 'run_discovery', arguments: {} });
  });
});
