import { createThesaurusApi } from './thesaurus.js';
import type { LoxtepHttpClient } from '../http/client.js';
import type { ThesaurusTerm } from './thesaurus-types.js';

const TERM: ThesaurusTerm = {
  term_id: 't1',
  organization_id: 'org1',
  canonical_key: 'order_id',
  precedence: 100,
  aliases: [{ system: 'shopify', path: 'order.id' }, { path: 'OrderId' }],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('createThesaurusApi', () => {
  it('list_terms GETs org thesaurus and returns terms', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { terms: [TERM] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createThesaurusApi(http, 'org1');
    const terms = await api.list_terms();

    expect(capturedPath).toBe('/graph/organizations/org1/thesaurus');
    expect(terms).toEqual([TERM]);
  });

  it('list_terms prefers explicit orgId over client default', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { terms: [] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createThesaurusApi(http, 'default-org');
    await api.list_terms('override-org');
    expect(capturedPath).toBe('/graph/organizations/override-org/thesaurus');
  });

  it('list_terms returns [] when response has no terms', async () => {
    const http = {
      get: async () => ({ success: true as const, data: {} }),
    } as unknown as LoxtepHttpClient;

    const api = createThesaurusApi(http, 'org1');
    await expect(api.list_terms()).resolves.toEqual([]);
  });

  it('list_terms throws when organization_id is missing', async () => {
    const http = { get: async () => ({}) } as unknown as LoxtepHttpClient;
    const api = createThesaurusApi(http);
    await expect(api.list_terms()).rejects.toThrow(/organization_id required/);
  });

  it('resolve_canonical_key matches canonical key case-insensitively', async () => {
    const http = {
      get: async () => ({ success: true as const, data: { terms: [TERM] } }),
    } as unknown as LoxtepHttpClient;

    const api = createThesaurusApi(http, 'org1');
    await expect(api.resolve_canonical_key('ORDER_ID')).resolves.toBe('order_id');
  });

  it('resolve_canonical_key matches alias path', async () => {
    const http = {
      get: async () => ({ success: true as const, data: { terms: [TERM] } }),
    } as unknown as LoxtepHttpClient;

    const api = createThesaurusApi(http, 'org1');
    await expect(api.resolve_canonical_key('order.id')).resolves.toBe('order_id');
    await expect(api.resolve_canonical_key('orderid')).resolves.toBe('order_id');
  });

  it('resolve_canonical_key returns null when unknown', async () => {
    const http = {
      get: async () => ({ success: true as const, data: { terms: [TERM] } }),
    } as unknown as LoxtepHttpClient;

    const api = createThesaurusApi(http, 'org1');
    await expect(api.resolve_canonical_key('unknown')).resolves.toBeNull();
  });

  it('resolve_canonical_key throws without org', async () => {
    const http = { get: async () => ({}) } as unknown as LoxtepHttpClient;
    const api = createThesaurusApi(http);
    await expect(api.resolve_canonical_key('x')).rejects.toThrow(/organization_id required/);
  });

  it('append_synonym POSTs synonym body with default precedence', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: TERM };
      },
    } as unknown as LoxtepHttpClient;

    const api = createThesaurusApi(http, 'org1');
    const result = await api.append_synonym('order_id', 'order.number', {
      system: 'netsuite',
    });

    expect(capturedPath).toBe('/graph/organizations/org1/thesaurus/synonyms');
    expect(capturedBody).toEqual({
      canonical_key: 'order_id',
      alias_path: 'order.number',
      system: 'netsuite',
      precedence: 100,
    });
    expect(result).toEqual(TERM);
  });

  it('append_synonym honors precedence and options.orgId', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: TERM };
      },
    } as unknown as LoxtepHttpClient;

    const api = createThesaurusApi(http);
    await api.append_synonym('order_id', 'oid', {
      precedence: 10,
      orgId: 'org-x',
    });

    expect(capturedPath).toBe('/graph/organizations/org-x/thesaurus/synonyms');
    expect(capturedBody).toMatchObject({ precedence: 10 });
  });

  it('append_synonym throws without org', async () => {
    const http = { post: async () => ({}) } as unknown as LoxtepHttpClient;
    const api = createThesaurusApi(http);
    await expect(api.append_synonym('k', 'a')).rejects.toThrow(/organization_id required/);
  });
});
