import type { LoxtepClient } from '../../client/loxtep-client.js';
import {
  runPacksActivateCommand,
  runPacksListCommand,
  runPacksStatusCommand,
} from './packs-cmd.js';

function mockClient(overrides: {
  organization_id?: string | null;
  list_available?: jest.Mock;
  activate?: jest.Mock;
  get_activation_status?: jest.Mock;
}): LoxtepClient {
  return {
    session: {
      get_current_user: async () =>
        overrides.organization_id
          ? { organization_id: overrides.organization_id }
          : {},
    },
    meaning: {
      packs: {
        list_available:
          overrides.list_available ??
          jest.fn(async () => ({ all_packs: [], recommended_pack_id: null })),
        activate:
          overrides.activate ??
          jest.fn(async () => ({
            pack_id: 'p1',
            organization_id: 'org-1',
            enabled: true,
            enabled_at: '2026-01-01T00:00:00Z',
          })),
        get_activation_status:
          overrides.get_activation_status ??
          jest.fn(async () => ({
            activation_state: 'no_pack_active',
            active_pack_id: null,
            active_pack_version: null,
            active_pack_display_name: null,
            enabled_at: null,
          })),
      },
    },
  } as unknown as LoxtepClient;
}

describe('packs-cmd', () => {
  it('lists available packs', async () => {
    const list_available = jest.fn(async () => ({
      recommended_pack_id: 'pack_abc',
      all_packs: [{ pack_id: 'pack_abc', display_name: 'E-Commerce' }],
    }));
    const result = await runPacksListCommand(mockClient({ list_available }));
    expect(result.exitCode).toBe(0);
    expect(list_available).toHaveBeenCalled();
    expect(result.stdout[0]).toContain('pack_abc');
  });

  it('activates pack with resolved organization_id', async () => {
    const activate = jest.fn(async () => ({
      pack_id: 'schema-org',
      organization_id: 'org-1',
      enabled: true,
      enabled_at: '2026-01-01T00:00:00Z',
    }));
    const result = await runPacksActivateCommand(
      mockClient({ organization_id: 'org-1', activate }),
      'schema-org'
    );
    expect(result.exitCode).toBe(0);
    expect(activate).toHaveBeenCalledWith({
      pack_id: 'schema-org',
      organization_id: 'org-1',
    });
  });

  it('fails activate when organization_id cannot be resolved', async () => {
    const result = await runPacksActivateCommand(mockClient({ organization_id: null }), 'p1');
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('organization_id is required');
  });

  it('returns activation status', async () => {
    const get_activation_status = jest.fn(async () => ({
      activation_state: 'pack_active',
      active_pack_id: 'schema-org',
      active_pack_version: '1.0.0',
      active_pack_display_name: 'Schema.org',
      enabled_at: '2026-01-01T00:00:00Z',
    }));
    const result = await runPacksStatusCommand(mockClient({ get_activation_status }));
    expect(result.exitCode).toBe(0);
    expect(get_activation_status).toHaveBeenCalled();
    expect(result.stdout[0]).toContain('pack_active');
  });
});
