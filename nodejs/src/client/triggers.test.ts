import { createTriggersApi } from './triggers.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createTriggersApi workflow_id resolution', () => {
  const trigger = {
    connection_id: 'conn-1',
    workflow_id: 'wf-1',
    project_id: 'proj-1',
    name: 'SDK Input',
    key: 'sdk-input',
    type: 'sdk',
    status: 'active',
    data: '{}',
    configuration: {},
    metadata: {},
    verified: false,
    draft: false,
    created_at: '2026-08-07T00:00:00Z',
    updated_at: '2026-08-07T00:00:00Z',
  };

  it('get resolves workflow_id from entities list when omitted', async () => {
    const paths: string[] = [];
    const http = {
      get: async (path: string) => {
        paths.push(path);
        if (path.endsWith('/entities')) {
          return { success: true as const, data: { connections: [trigger] } };
        }
        return { success: true as const, data: trigger };
      },
    } as unknown as LoxtepHttpClient;

    const api = createTriggersApi(http);
    const result = await api.get('conn-1', { project_id: 'proj-1' });

    expect(paths[0]).toBe('/workflows/projects/proj-1/entities');
    expect(paths[1]).toBe('/workflows/projects/proj-1/entities/connections/conn-1?workflow_id=wf-1');
    expect(result.connection_id).toBe('conn-1');
  });

  it('get uses explicit workflow_id without listing', async () => {
    const paths: string[] = [];
    const http = {
      get: async (path: string) => {
        paths.push(path);
        return { success: true as const, data: trigger };
      },
    } as unknown as LoxtepHttpClient;

    const api = createTriggersApi(http);
    await api.get('conn-1', { project_id: 'proj-1', workflow_id: 'wf-1' });

    expect(paths).toEqual([
      '/workflows/projects/proj-1/entities/connections/conn-1?workflow_id=wf-1',
    ]);
  });

  it('get errors when connection is missing from list', async () => {
    const http = {
      get: async () => ({ success: true as const, data: { connections: [] } }),
    } as unknown as LoxtepHttpClient;

    const api = createTriggersApi(http);
    await expect(api.get('missing', { project_id: 'proj-1' })).rejects.toThrow(/not found/);
  });

  it('get errors when project_id is omitted', async () => {
    const api = createTriggersApi({ get: async () => ({}) } as unknown as LoxtepHttpClient);
    await expect(api.get('conn-1')).rejects.toThrow(/requires project_id/);
  });

  it('get errors when connection has no workflow_id', async () => {
    const http = {
      get: async () => ({
        success: true as const,
        data: { connections: [{ ...trigger, workflow_id: undefined }] },
      }),
    } as unknown as LoxtepHttpClient;
    const api = createTriggersApi(http);
    await expect(api.get('conn-1', { project_id: 'proj-1' })).rejects.toThrow(/no workflow_id/);
  });

  it('get errors when multiple workflows own the connection', async () => {
    const http = {
      get: async () => ({
        success: true as const,
        data: {
          connections: [
            { ...trigger, workflow_id: 'wf-a' },
            { ...trigger, workflow_id: 'wf-b' },
          ],
        },
      }),
    } as unknown as LoxtepHttpClient;
    const api = createTriggersApi(http);
    await expect(api.get('conn-1', { project_id: 'proj-1' })).rejects.toThrow(/Multiple workflows/);
  });
});

describe('createTriggersApi list/create/update/delete/test', () => {
  const base = {
    connection_id: 'conn-1',
    workflow_id: 'wf-1',
    project_id: 'proj-1',
    name: 'SDK Input',
    key: 'sdk-input',
    type: 'sdk',
    status: 'active',
    data: '{}',
    configuration: { url: 'https://hooks.example.com' },
    metadata: {},
    verified: true,
    draft: false,
    created_at: '2026-08-07T00:00:00Z',
    updated_at: '2026-08-07T00:00:00Z',
  };

  it('list filters by search, type, status, workflow_id, verified, draft', async () => {
    const items = [
      base,
      {
        ...base,
        connection_id: 'conn-2',
        name: 'Other',
        key: 'other',
        type: 'webhook',
        status: 'inactive',
        verified: false,
        draft: true,
        workflow_id: 'wf-2',
        configuration: {},
      },
    ];
    const http = {
      get: async () => ({ success: true as const, data: { connections: items } }),
    } as unknown as LoxtepHttpClient;
    const api = createTriggersApi(http);

    const bySearch = await api.list({ project_id: 'proj-1', search: 'sdk' });
    expect(bySearch.items).toHaveLength(1);
    expect(bySearch.items[0].connection_id).toBe('conn-1');

    const byType = await api.list({ project_id: 'proj-1', type: ['webhook'] });
    expect(byType.items).toHaveLength(1);

    const byStatus = await api.list({ project_id: 'proj-1', status: 'inactive' });
    expect(byStatus.items).toHaveLength(1);

    const byWf = await api.list({ project_id: 'proj-1', workflow_id: 'wf-2' });
    expect(byWf.items).toHaveLength(1);

    const verified = await api.list({ project_id: 'proj-1', verified: true });
    expect(verified.items).toHaveLength(1);

    const draft = await api.list({ project_id: 'proj-1', draft: true });
    expect(draft.items).toHaveLength(1);
  });

  it('create requires workflow_id and PUTs a new connection', async () => {
    const puts: Array<{ path: string; body: unknown }> = [];
    const http = {
      put: async (path: string, body: unknown) => {
        puts.push({ path, body });
        return { success: true as const, data: body };
      },
    } as unknown as LoxtepHttpClient;
    const api = createTriggersApi(http);

    await expect(
      api.create({
        project_id: 'proj-1',
        key: 'k',
        name: 'N',
        type: 'sdk',
      } as never)
    ).rejects.toThrow(/requires workflow_id/);

    const created = await api.create({
      project_id: 'proj-1',
      workflow_id: 'wf-1',
      key: 'k',
      name: 'N',
      type: 'sdk',
    });
    expect(created.workflow_id).toBe('wf-1');
    expect(puts[0].path).toContain('/entities/connections/');
    expect(puts[0].path).toContain('workflow_id=wf-1');
  });

  it('update merges existing trigger and PUTs', async () => {
    const http = {
      get: async (path: string) => {
        if (path.endsWith('/entities')) {
          return { success: true as const, data: { connections: [base] } };
        }
        return { success: true as const, data: base };
      },
      put: async (_path: string, body: unknown) => ({ success: true as const, data: body }),
    } as unknown as LoxtepHttpClient;
    const api = createTriggersApi(http);
    const updated = await api.update(
      'conn-1',
      { name: 'Renamed' },
      { project_id: 'proj-1', workflow_id: 'wf-1' }
    );
    expect(updated.name).toBe('Renamed');
    expect(updated.connection_id).toBe('conn-1');
  });

  it('delete resolves workflow_id and calls http.delete', async () => {
    const deleted: string[] = [];
    const http = {
      get: async () => ({ success: true as const, data: { connections: [base] } }),
      delete: async (path: string) => {
        deleted.push(path);
      },
    } as unknown as LoxtepHttpClient;
    const api = createTriggersApi(http);
    await api.delete('conn-1', { project_id: 'proj-1' });
    expect(deleted[0]).toContain('conn-1');
    expect(deleted[0]).toContain('workflow_id=wf-1');
  });

  it('test returns probe message when configuration has a URL', async () => {
    const http = {
      get: async () => ({ success: true as const, data: base }),
    } as unknown as LoxtepHttpClient;
    const api = createTriggersApi(http);
    const result = await api.test('conn-1', { project_id: 'proj-1', workflow_id: 'wf-1' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('probe URL present');
    expect(result.details?.has_probe_url).toBe(true);
  });

  it('test reports no probe URL when configuration lacks one', async () => {
    const http = {
      get: async () => ({
        success: true as const,
        data: { ...base, configuration: {}, name: 'Plain' },
      }),
    } as unknown as LoxtepHttpClient;
    const api = createTriggersApi(http);
    const result = await api.test('conn-1', { project_id: 'proj-1', workflow_id: 'wf-1' });
    expect(result.message).toContain('No HTTP probe URL');
  });
});
