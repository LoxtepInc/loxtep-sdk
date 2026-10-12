import { createCdlcApi } from './cdlc.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createCdlcApi', () => {
  it('get_artifact_lifecycle calls GET .../cdlc/artifacts/{ref} and normalizes', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: {
            artifact_ref: 'thesaurus_term:t1',
            lifecycle_state: 'draft',
            change_propagation_policy: 'queue_review',
            owner: 'alice',
            allowed_transitions: ['in_review', 'retired'],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    const result = await api.get_artifact_lifecycle({ artifact_ref: 'thesaurus_term:t1' });

    expect(capturedPath).toBe(
      '/graph/organizations/org1/cdlc/artifacts/thesaurus_term%3At1'
    );
    expect(result).toEqual({
      artifact_ref: 'thesaurus_term:t1',
      lifecycle_state: 'draft',
      change_propagation_policy: 'queue_review',
      owner: 'alice',
      allowed_transitions: ['in_review', 'retired'],
    });
  });

  it('transition_lifecycle POSTs body to .../transition', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: {
            artifact_ref: 'ontology_concept:c1',
            from: 'draft',
            to: 'in_review',
            actor: 'u1',
            transitioned_at: '2026-08-10T00:00:00Z',
            allowed_transitions: ['approved', 'draft', 'retired'],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    const result = await api.transition_lifecycle({
      artifact_ref: 'ontology_concept:c1',
      current_state: 'draft',
      target_state: 'in_review',
      actor: 'u1',
      owner: 'bob',
    });

    expect(capturedPath).toBe(
      '/graph/organizations/org1/cdlc/artifacts/ontology_concept%3Ac1/transition'
    );
    expect(capturedBody).toEqual({
      current_state: 'draft',
      target_state: 'in_review',
      actor: 'u1',
      owner: 'bob',
    });
    expect(result.from).toBe('draft');
    expect(result.to).toBe('in_review');
  });

  it('propagate_change POSTs to .../cdlc/propagate', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: {
            source_artifact_ref: 'thesaurus_term:t1',
            new_version: '2',
            previous_version: '1',
            resolved_policy: 'queue_review',
            actions: [{ artifact_ref: 'ontology_concept:c1', action: 'queue_review' }],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http);
    const result = await api.propagate_change({
      organization_id: 'org1',
      artifact_ref: 'thesaurus_term:t1',
      new_version: '2',
      previous_version: '1',
      change_propagation_policy: 'queue_review',
    });

    expect(capturedPath).toBe('/graph/organizations/org1/cdlc/propagate');
    expect(capturedBody).toEqual({
      artifact_ref: 'thesaurus_term:t1',
      new_version: '2',
      previous_version: '1',
      change_propagation_policy: 'queue_review',
    });
    expect(result.resolved_policy).toBe('queue_review');
    expect(result.actions).toHaveLength(1);
  });

  it('list_propagation_lineage builds query string and normalizes array payloads', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: [
            {
              id: 'pl1',
              source_artifact_ref: 'thesaurus_term:t1',
              action_taken: 'queue_review',
              actor: 'u1',
            },
          ],
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    const result = await api.list_propagation_lineage({
      source_artifact_ref: 'thesaurus_term:t1',
      action_taken: 'queue_review',
      actor: 'u1',
      from_date: '2026-01-01',
      to_date: '2026-12-31',
    });

    expect(capturedPath).toBe(
      '/graph/organizations/org1/cdlc/propagation-lineage?source_artifact_ref=thesaurus_term%3At1&action_taken=queue_review&actor=u1&from_date=2026-01-01&to_date=2026-12-31'
    );
    expect(result.count).toBe(1);
    expect(result.records[0]?.id).toBe('pl1');
  });

  it('list_context_dependencies builds query string', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: {
            dependencies: [
              {
                id: 'd1',
                from_artifact_ref: 'thesaurus_term:t1',
                to_artifact_ref: 'ontology_concept:c1',
                dependency_type: 'uses_term',
                organization_id: 'org1',
                created_at: '2026-08-01T00:00:00Z',
              },
            ],
            count: 1,
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    const result = await api.list_context_dependencies({
      from_artifact_ref: 'thesaurus_term:t1',
      dependency_type: 'uses_term',
    });

    expect(capturedPath).toBe(
      '/graph/organizations/org1/cdlc/dependencies?from_artifact_ref=thesaurus_term%3At1&dependency_type=uses_term'
    );
    expect(result.count).toBe(1);
    expect(result.dependencies[0]?.id).toBe('d1');
  });

  it('list_review_queue GETs .../review-queue and normalizes snake_case rows', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: [
            {
              id: 'rt1',
              artifact_ref: 'ontology_concept:c1',
              artifact_name: 'Concept One',
              artifact_type: 'ontology_concept',
              source_artifact_ref: 'thesaurus_term:t1',
              source_artifact_name: 'Term One',
              version_before: '1',
              version_after: '2',
              actor: 'u1',
              status: 'pending',
              created_at: '2026-08-10T00:00:00Z',
              owner: 'steward',
            },
          ],
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    const result = await api.list_review_queue({ domain_id: 'dom-1' });

    expect(capturedPath).toBe(
      '/graph/organizations/org1/cdlc/review-queue?domain_id=dom-1'
    );
    expect(result.count).toBe(1);
    expect(result.tasks[0]).toMatchObject({
      id: 'rt1',
      artifact_ref: 'ontology_concept:c1',
      status: 'pending',
      owner: 'steward',
    });
  });

  it('throws when organization_id is missing from both deps and call', async () => {
    const http = {
      get: async () => ({ success: true as const, data: {} }),
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http);

    await expect(
      api.get_artifact_lifecycle({ artifact_ref: 'thesaurus_term:t1' })
    ).rejects.toThrow('organization_id is required');
  });

  it('list_artifacts GETs .../cdlc/artifacts with snake_case filters', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: [{ artifact_ref: 'thesaurus_term:t1', lifecycle_state: 'draft' }],
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    const result = await api.list_artifacts({
      lifecycle_state: 'draft',
      scope: 'personal',
      artifact_type: 'thesaurus_term',
      owner: 'alice',
      domain_id: 'dom-1',
    });

    expect(capturedPath).toBe(
      '/graph/organizations/org1/cdlc/artifacts?lifecycle_state=draft&scope=personal&artifact_type=thesaurus_term&owner=alice&domain_id=dom-1'
    );
    expect(result.count).toBe(1);
    expect(result.artifacts[0]?.artifact_ref).toBe('thesaurus_term:t1');
  });

  it('submit_for_review POSTs artifact_refs only', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: { results: [{ artifact_ref: 'thesaurus_term:t1' }] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    const result = await api.submit_for_review({
      artifact_refs: ['thesaurus_term:t1', 'ontology_concept:c1'],
    });

    expect(capturedPath).toBe('/graph/organizations/org1/cdlc/artifacts/submit-for-review');
    expect(capturedBody).toEqual({
      artifact_refs: ['thesaurus_term:t1', 'ontology_concept:c1'],
    });
    expect(result.results).toHaveLength(1);
  });

  it('list_cdlc_review_queue is the same GET as list_review_queue', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { tasks: [], count: 0 } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    await api.list_cdlc_review_queue({ domain_id: 'dom-1' });
    expect(capturedPath).toBe('/graph/organizations/org1/cdlc/review-queue?domain_id=dom-1');
  });

  it('list_identity_clusters GETs .../identity-clusters', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: [{ cluster_key: 'ck1' }] };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    const result = await api.list_identity_clusters();
    expect(capturedPath).toBe('/graph/organizations/org1/cdlc/identity-clusters');
    expect(result.count).toBe(1);
    expect(result.clusters[0]?.cluster_key).toBe('ck1');
  });

  it('approve_review POSTs an empty body', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: { id: 'task-1', status: 'approved' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http, { organization_id: 'org1' });
    const result = await api.approve_review({ task_id: 'task-1' });
    expect(capturedPath).toBe('/graph/organizations/org1/cdlc/review-queue/task-1/approve');
    expect(capturedBody).toEqual({});
    expect(result).toEqual({ id: 'task-1', status: 'approved' });
  });

  it('bridge_semantics POSTs /graph/cdlc/bridge-semantics without an org prefix', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: { data_product_id: 'dp-1', artifact_ref: 'semantic_attachment:dp-1' },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http);
    const result = await api.bridge_semantics({ data_product_id: 'dp-1' });
    expect(capturedPath).toBe('/graph/cdlc/bridge-semantics');
    expect(capturedBody).toEqual({ data_product_id: 'dp-1' });
    expect(result).toEqual({
      data_product_id: 'dp-1',
      artifact_ref: 'semantic_attachment:dp-1',
    });
  });
});
