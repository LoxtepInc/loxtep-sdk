import { createBundlesApi } from './bundles.js';
import { LoxtepError } from '../errors/base.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createBundlesApi', () => {
  it('import POSTs /semantic-layer/bundles/import and unwraps result', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: {
            dry_run: false,
            applied_count: 2,
            skipped_count: 0,
            errors: [],
            applied: [
              { artifact_id: 'a1', artifact_type: 'thesaurus_term', action: 'created' },
              { artifact_id: 'a2', artifact_type: 'domain_schema', action: 'created' },
            ],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createBundlesApi(http);
    const result = await api.import({
      bundle: {
        artifacts: [
          { artifact_id: 'a1', artifact_type: 'thesaurus_term' },
          { artifact_id: 'a2', artifact_type: 'domain_schema' },
        ],
      },
    });

    expect(capturedPath).toBe('/semantic-layer/bundles/import');
    expect(capturedBody).toMatchObject({ dry_run: false });
    expect(result.applied_count).toBe(2);
    expect(result.skipped_count).toBe(0);
    expect(result.partial).toBeUndefined();
  });

  it('import surfaces skipped/errors as partial', async () => {
    const http = {
      post: async () => ({
        success: true as const,
        data: {
          dry_run: false,
          applied_count: 1,
          skipped_count: 1,
          errors: [
            {
              artifact_id: 'type1',
              artifact_type: 'ontology_concept',
              message: 'unsupported',
            },
          ],
          applied: [{ artifact_id: 'a1', artifact_type: 'thesaurus_term', action: 'created' }],
        },
      }),
    } as unknown as LoxtepHttpClient;

    const api = createBundlesApi(http);
    const result = await api.import({
      bundle: { artifacts: [{ artifact_id: 'a1', artifact_type: 'thesaurus_term' }] },
    });

    expect(result.skipped_count).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.partial).toBe(true);
  });

  it('import returns result from 422 LoxtepError details when present', async () => {
    const http = {
      post: async () => {
        throw new LoxtepError('Partial import', {
          code: 'VALIDATION_ERROR',
          status_code: 422,
          details: {
            dry_run: false,
            applied_count: 0,
            skipped_count: 1,
            errors: [
              {
                artifact_id: 'x',
                artifact_type: 'ontology_concept',
                message: 'skipped',
              },
            ],
            applied: [],
          },
        });
      },
    } as unknown as LoxtepHttpClient;

    const api = createBundlesApi(http);
    const result = await api.import({
      bundle: { artifacts: [{ artifact_id: 'x', artifact_type: 'ontology_concept' }] },
    });

    expect(result.partial).toBe(true);
    expect(result.status_code).toBe(422);
    expect(result.skipped_count).toBe(1);
    expect(result.errors[0]?.message).toBe('skipped');
  });

  it('import requires bundle', async () => {
    const http = { post: async () => ({}) } as unknown as LoxtepHttpClient;
    const api = createBundlesApi(http);
    await expect(api.import({} as any)).rejects.toThrow(/bundle is required/);
  });
});
