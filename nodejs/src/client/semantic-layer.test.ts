import type { LoxtepHttpClient } from '../http/client.js';
import { createSemanticLayerApi, semanticArtifactPathSegment } from './semantic-layer.js';

describe('semanticArtifactPathSegment', () => {
  it('maps MCP artifact types to REST path segments', () => {
    expect(semanticArtifactPathSegment('entity')).toBe('entities');
    expect(semanticArtifactPathSegment('glossary_term')).toBe('glossary');
    expect(semanticArtifactPathSegment('process_map')).toBe('process-maps');
    expect(semanticArtifactPathSegment('schema')).toBe('schema');
    expect(semanticArtifactPathSegment('ontology')).toBe('ontology');
  });
});

describe('createSemanticLayerApi', () => {
  it('search POSTs /semantic-layer/search with query body', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: {
            items: [
              {
                artifact_type: 'glossary_term',
                id: '11111111-1111-1111-1111-111111111111',
                name: 'Order',
                description: null,
                relevance_score: 0.9,
              },
            ],
            pagination: { total: 1, page: 1, page_size: 20 },
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createSemanticLayerApi(http);
    const result = await api.search({ query: 'order', page: 1, page_size: 20 });
    expect(capturedPath).toBe('/semantic-layer/search');
    expect(capturedBody).toEqual({
      query: 'order',
      artifact_types: undefined,
      domain: undefined,
      industry_relevance: undefined,
      page: 1,
      page_size: 20,
    });
    expect(result.items).toHaveLength(1);
    expect(result.pagination.total).toBe(1);

    await api.search_semantic_layer('invoice');
    expect(capturedPath).toBe('/semantic-layer/search');
    expect((capturedBody as { query: string }).query).toBe('invoice');
  });

  it('throws when search query missing', async () => {
    const http = {
      post: async () => ({ success: true as const, data: { items: [], pagination: {} } }),
    } as unknown as LoxtepHttpClient;
    const api = createSemanticLayerApi(http);
    await expect(api.search({ query: '' })).rejects.toThrow('query is required');
  });

  it('get_artifact GETs typed semantic-layer path', async () => {
    let capturedPath: string | null = null;
    const id = '22222222-2222-2222-2222-222222222222';
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { id, name: 'Customer' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createSemanticLayerApi(http);
    const result = await api.get_artifact({ artifact_type: 'entity', id });
    expect(capturedPath).toBe(`/semantic-layer/entities/${id}`);
    expect(result).toMatchObject({ id, name: 'Customer' });

    await api.get_semantic_artifact({
      artifact_type: 'glossary_term',
      artifact_id: id,
    });
    expect(capturedPath).toBe(`/semantic-layer/glossary/${id}`);
  });

  it('throws when get_artifact id missing', async () => {
    const http = {
      get: async () => ({ success: true as const, data: {} }),
    } as unknown as LoxtepHttpClient;
    const api = createSemanticLayerApi(http);
    await expect(api.get_artifact({ artifact_type: 'entity' })).rejects.toThrow(
      'Either id or artifact_id is required'
    );
  });

  it('get_completeness GETs /semantic-layer/completeness', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: {
            domains: [
              {
                domain_id: 'd1',
                total_schema_fields: 10,
                annotated_fields: 4,
                unannotated_fields: 6,
                coverage_percentage: 40,
              },
            ],
            needs_attention: [
              {
                domain_id: 'd1',
                total_schema_fields: 10,
                annotated_fields: 4,
                unannotated_fields: 6,
                coverage_percentage: 40,
              },
            ],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createSemanticLayerApi(http);
    const result = await api.get_completeness();
    expect(capturedPath).toBe('/semantic-layer/completeness');
    expect(result.domains).toHaveLength(1);
    expect(result.needs_attention[0]?.coverage_percentage).toBe(40);

    await api.get_semantic_completeness({ domain_id: '33333333-3333-3333-3333-333333333333' });
    expect(capturedPath).toBe(
      '/semantic-layer/completeness?domain_id=33333333-3333-3333-3333-333333333333'
    );
  });
});
