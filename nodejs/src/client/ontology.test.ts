import { createOntologyApi } from './ontology.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createOntologyApi', () => {
  const concept = {
    concept_id: 'c1',
    organization_id: 'org1',
    name: 'Order',
    namespace: 'commerce',
    node_type: 'entity' as const,
    created_at: '2026-01-01T00:00:00Z',
  };

  const relationship = {
    relationship_id: 'r1',
    organization_id: 'org1',
    source_entity_type: 'Order',
    target_entity_type: 'Person',
    relation_type: 'customer',
    created_at: '2026-01-01T00:00:00Z',
  };

  it('list_concepts calls GET .../ontology/concepts with filters', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { concepts: [concept], total: 1 } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createOntologyApi(http, { organization_id: 'org1' });
    const result = await api.list_concepts({ namespace: 'commerce', node_type: 'entity' });

    expect(capturedPath).toBe(
      '/graph/organizations/org1/ontology/concepts?namespace=commerce&node_type=entity'
    );
    expect(result).toEqual({ concepts: [concept], total: 1 });
  });

  it('get_concept calls GET .../ontology/concepts/:id', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: concept };
      },
    } as unknown as LoxtepHttpClient;

    const api = createOntologyApi(http, { organization_id: 'org1' });
    const result = await api.get_concept('c1');

    expect(capturedPath).toBe('/graph/organizations/org1/ontology/concepts/c1');
    expect(result).toEqual(concept);
  });

  it('create_concept posts required body fields', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: concept };
      },
    } as unknown as LoxtepHttpClient;

    const api = createOntologyApi(http, { organization_id: 'org1' });
    const result = await api.create_concept({
      name: 'Order',
      namespace: 'commerce',
      node_type: 'entity',
      description: 'Purchase order',
    });

    expect(capturedPath).toBe('/graph/organizations/org1/ontology/concepts');
    expect(capturedBody).toEqual({
      name: 'Order',
      namespace: 'commerce',
      node_type: 'entity',
      description: 'Purchase order',
      uri: undefined,
      parent_concepts: undefined,
    });
    expect(result).toEqual(concept);
  });

  it('create_concept includes canonical_key and aliases when supplied', async () => {
    let capturedBody: unknown = null;
    const http = {
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return { success: true as const, data: concept };
      },
    } as unknown as LoxtepHttpClient;

    const api = createOntologyApi(http, { organization_id: 'org1' });
    await api.create_concept({
      name: 'PersonIdentity',
      namespace: 'patch.semantic',
      node_type: 'entity',
      canonical_key: 'patch.semantic.PersonIdentity',
      aliases: [{ system: 'patch.semantic.v1', path: 'PersonIdentity' }],
    });

    expect(capturedBody).toEqual(
      expect.objectContaining({
        canonical_key: 'patch.semantic.PersonIdentity',
        aliases: [{ system: 'patch.semantic.v1', path: 'PersonIdentity' }],
      })
    );
  });

  it('repair_vocabulary defaults to dry_run true', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: {
            dry_run: true,
            raw_scanned: 0,
            tombstoned: 0,
            duplicate_node: 0,
            eligible: 0,
            already_registered: 0,
            would_create: 0,
            failed: [],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createOntologyApi(http, { organization_id: 'org1' });
    const result = await api.repair_vocabulary();

    expect(capturedPath).toBe('/semantic-layer/migrations/ontology-vocabulary-repair');
    expect(capturedBody).toEqual({ dry_run: true });
    expect(result.dry_run).toBe(true);
  });

  it('update_concept PUTs only defined fields', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      put: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: { ...concept, description: 'updated' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createOntologyApi(http, { organization_id: 'org1' });
    await api.update_concept('c1', { description: 'updated' });

    expect(capturedPath).toBe('/graph/organizations/org1/ontology/concepts/c1');
    expect(capturedBody).toEqual({ description: 'updated' });
  });

  it('delete_concept DELETEs and returns warnings when present', async () => {
    let capturedPath: string | null = null;
    const http = {
      delete: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: { ...concept, tombstoned_at: '2026-02-01T00:00:00Z' },
          warnings: ['downstream refs'],
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createOntologyApi(http, { organization_id: 'org1' });
    const result = await api.delete_concept('c1');

    expect(capturedPath).toBe('/graph/organizations/org1/ontology/concepts/c1');
    expect(result.concept.tombstoned_at).toBe('2026-02-01T00:00:00Z');
    expect(result.warnings).toEqual(['downstream refs']);
  });

  it('create_relationship posts source/target/relation_type', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: relationship };
      },
    } as unknown as LoxtepHttpClient;

    const api = createOntologyApi(http, { organization_id: 'org1' });
    const result = await api.create_relationship({
      source_entity_type: 'Order',
      target_entity_type: 'Person',
      relation_type: 'customer',
      join_field: 'customer_id',
    });

    expect(capturedPath).toBe('/graph/organizations/org1/ontology/relationships');
    expect(capturedBody).toMatchObject({
      source_entity_type: 'Order',
      target_entity_type: 'Person',
      relation_type: 'customer',
      join_field: 'customer_id',
    });
    expect(result).toEqual(relationship);
  });

  it('get_relationships / list_relationships share GET path + filters', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: { relationships: [relationship], total: 1, source: 'registry' as const },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createOntologyApi(http, { organization_id: 'org1' });
    const viaGet = await api.get_relationships({
      source_entity_type: 'Order',
      include_discovered: false,
      limit: 10,
    });
    expect(capturedPath).toBe(
      '/graph/organizations/org1/ontology/relationships?include_discovered=false&limit=10&source_entity_type=Order'
    );
    expect(viaGet.total).toBe(1);

    capturedPath = null;
    const viaList = await api.list_relationships({ relation_type: 'customer' });
    expect(capturedPath).toBe(
      '/graph/organizations/org1/ontology/relationships?relation_type=customer'
    );
    expect(viaList.relationships).toHaveLength(1);
  });

  it('throws when organization_id missing', async () => {
    const http = {
      get: async () => ({ success: true as const, data: { concepts: [], total: 0 } }),
    } as unknown as LoxtepHttpClient;
    const api = createOntologyApi(http);
    await expect(api.list_concepts()).rejects.toThrow('organization_id is required');
  });
});
