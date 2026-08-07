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
});
