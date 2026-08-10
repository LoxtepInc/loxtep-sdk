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

  it('throws when organization_id is missing from both deps and call', async () => {
    const http = {
      get: async () => ({ success: true as const, data: {} }),
    } as unknown as LoxtepHttpClient;

    const api = createCdlcApi(http);

    await expect(
      api.get_artifact_lifecycle({ artifact_ref: 'thesaurus_term:t1' })
    ).rejects.toThrow('organization_id is required');
  });
});
