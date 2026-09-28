import { createShapesApi } from './shapes.js';
import type { LoxtepHttpClient } from '../http/client.js';

const SHAPE = {
  schema_id: 's1',
  organization_id: 'org1',
  domain_id: 'd1',
  name: 'PersonIdentity',
  aligned_to_concept_uri: null as string | null,
  version_count: 1,
};

describe('createShapesApi', () => {
  it('create POSTs /semantic-layer/schemas', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: { ...SHAPE, schema_version_id: 'v1', version: '1.0.0', format: 'json-schema' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createShapesApi(http);
    await api.create({
      name: 'PersonIdentity',
      format: 'json-schema',
      fields: [{ name: 'email', type: 'string' }],
    });

    expect(capturedPath).toBe('/semantic-layer/schemas');
    expect(capturedBody).toMatchObject({
      name: 'PersonIdentity',
      format: 'json-schema',
      version: '1.0.0',
    });
  });

  it('list GETs and unwraps paginated items', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: { items: [SHAPE], pagination: { total: 1, page: 1, page_size: 1 } },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createShapesApi(http);
    const result = await api.list({ domain_id: 'd1' });
    expect(capturedPath).toBe('/semantic-layer/schemas?domain=d1');
    expect(result.shapes).toEqual([SHAPE]);
    expect(result.total).toBe(1);
  });

  it('get returns schema + versions', async () => {
    const http = {
      get: async () => ({
        success: true as const,
        data: { schema: SHAPE, versions: [{ schema_id: 's1', schema_version_id: 'v1', version: '1.0.0', format: 'json-schema' }] },
      }),
    } as unknown as LoxtepHttpClient;

    const api = createShapesApi(http);
    const detail = await api.get('s1');
    expect(detail.schema).toEqual(SHAPE);
    expect(detail.versions).toHaveLength(1);
  });

  it('apply POSTs applications', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: { schema_id: 's1', data_product_id: 'dp1', application_id: 'a1' },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createShapesApi(http);
    await api.apply({ schema_id: 's1', data_product_id: 'dp1' });
    expect(capturedPath).toBe('/semantic-layer/schemas/s1/applications');
    expect(capturedBody).toEqual({ data_product_id: 'dp1' });
  });

  it('align PUTs aligned_to_concept_uri', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      put: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: { ...SHAPE, aligned_to_concept_uri: 'https://example.org/Person' },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createShapesApi(http);
    const result = await api.align({
      schema_id: 's1',
      aligned_to_concept_uri: 'https://example.org/Person',
    });
    expect(capturedPath).toBe('/semantic-layer/schemas/s1');
    expect(capturedBody).toEqual({ aligned_to_concept_uri: 'https://example.org/Person' });
    expect(result.aligned_to_concept_uri).toBe('https://example.org/Person');
  });
});
