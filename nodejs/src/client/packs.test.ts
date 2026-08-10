import type { LoxtepHttpClient } from '../http/client.js';
import {
  createPacksApi,
  normalizeListAvailablePacksResult,
  normalizePackActivationStatus,
} from './packs.js';

describe('normalizePackActivationStatus', () => {
  it('maps camelCase graph payloads to snake_case', () => {
    expect(
      normalizePackActivationStatus({
        activationState: 'pack_active',
        activePackId: 'schema-org',
        activePackVersion: '1.0.0',
        activePackDisplayName: 'Schema.org',
        enabledAt: '2026-01-01T00:00:00Z',
      })
    ).toEqual({
      activation_state: 'pack_active',
      active_pack_id: 'schema-org',
      active_pack_version: '1.0.0',
      active_pack_display_name: 'Schema.org',
      enabled_at: '2026-01-01T00:00:00Z',
    });
  });

  it('keeps snake_case MCP-shaped payloads', () => {
    expect(
      normalizePackActivationStatus({
        activation_state: 'activating',
        active_pack_id: 'gs1',
        active_pack_version: null,
        active_pack_display_name: null,
        enabled_at: null,
      })
    ).toMatchObject({
      activation_state: 'activating',
      active_pack_id: 'gs1',
    });
  });
});

describe('normalizeListAvailablePacksResult', () => {
  it('keeps recommend envelope', () => {
    const result = normalizeListAvailablePacksResult({
      recommended_pack_id: 'pack_abc',
      confidence: 'high',
      reason: 'retail',
      all_packs: [{ pack_id: 'pack_abc', display_name: 'E-Commerce', term_count: 10 }],
    });
    expect(result.recommended_pack_id).toBe('pack_abc');
    expect(result.all_packs).toHaveLength(1);
  });

  it('wraps bare admin list arrays', () => {
    const result = normalizeListAvailablePacksResult([
      { pack_id: 'a', display_name: 'A' },
      { packId: 'b', displayName: 'B' },
    ]);
    expect(result.all_packs.map((p) => p.pack_id)).toEqual(['a', 'b']);
  });
});

describe('createPacksApi', () => {
  it('list_available GETs /graph/admin/vocabulary-packs/recommend', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: {
            recommended_pack_id: 'pack_abc',
            confidence: 'high',
            reason: 'Matched industry',
            all_packs: [
              {
                pack_id: 'pack_abc',
                display_name: 'E-Commerce Standard',
                term_count: 250,
                version: '2.1.0',
              },
            ],
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createPacksApi(http);
    const result = await api.list_available();
    expect(capturedPath).toBe('/graph/admin/vocabulary-packs/recommend');
    expect(result.recommended_pack_id).toBe('pack_abc');
    expect(result.all_packs[0]?.pack_id).toBe('pack_abc');

    const viaAlias = await api.list_available_packs();
    expect(viaAlias.all_packs).toHaveLength(1);
  });

  it('activate POSTs enable with organization_id body', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return {
          success: true as const,
          data: {
            pack_id: 'schema-org',
            organization_id: 'org1',
            enabled: true,
            enabled_at: '2026-01-01T00:00:00Z',
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createPacksApi(http, { organization_id: 'org1' });
    const result = await api.activate('schema-org');
    expect(capturedPath).toBe('/graph/admin/vocabulary-packs/schema-org/enable');
    expect(capturedBody).toEqual({ organization_id: 'org1' });
    expect(result.enabled).toBe(true);

    await api.activate_vocabulary_pack({ pack_id: 'gs1', organization_id: 'org2' });
    expect(capturedPath).toBe('/graph/admin/vocabulary-packs/gs1/enable');
    expect(capturedBody).toEqual({ organization_id: 'org2' });
  });

  it('get_activation_status GETs semantic-layer activation-state', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: {
            activationState: 'no_pack_active',
            activePackId: null,
            activePackVersion: null,
            activePackDisplayName: null,
            enabledAt: null,
          },
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createPacksApi(http);
    const result = await api.get_activation_status();
    expect(capturedPath).toBe('/graph/semantic-layer/activation-state');
    expect(result).toEqual({
      activation_state: 'no_pack_active',
      active_pack_id: null,
      active_pack_version: null,
      active_pack_display_name: null,
      enabled_at: null,
    });

    await api.get_pack_activation_status();
    expect(capturedPath).toBe('/graph/semantic-layer/activation-state');
  });

  it('throws when organization_id missing on activate', async () => {
    const http = {
      post: async () => ({ success: true as const, data: {} }),
    } as unknown as LoxtepHttpClient;
    const api = createPacksApi(http);
    await expect(api.activate('schema-org')).rejects.toThrow('organization_id is required');
  });
});
