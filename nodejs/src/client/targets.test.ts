import { createTargetsApi } from './targets.js';
import type { LoxtepHttpClient } from '../http/client.js';
import type { Target } from './target-types.js';

describe('createTargetsApi', () => {
  const target: Target = {
    connection_id: 'tgt-1',
    workflow_id: 'wf-1',
    project_id: 'proj-1',
    name: 'Delivery Out',
    key: 'delivery-out',
    type: 'webhook',
    status: 'active',
    direction: 'outbound',
    data: '{}',
    configuration: { direction: 'outbound' },
    metadata: { direction: 'outbound' },
    verified: false,
    draft: false,
    created_at: '2026-08-07T00:00:00Z',
    updated_at: '2026-08-07T00:00:00Z',
  };

  const inbound: Target = {
    ...target,
    connection_id: 'tgt-in',
    name: 'In Source',
    key: 'in-source',
    type: 'sdk',
    status: 'draft',
    direction: 'inbound',
    workflow_id: 'wf-2',
    configuration: { direction: 'inbound' },
    metadata: {},
  };

  describe('get', () => {
    it('resolves workflow_id from entities list when omitted', async () => {
      const paths: string[] = [];
      const http = {
        get: async (path: string) => {
          paths.push(path);
          if (path.endsWith('/entities')) {
            return { success: true as const, data: { connections: [target] } };
          }
          return { success: true as const, data: target };
        },
      } as unknown as LoxtepHttpClient;

      const api = createTargetsApi(http);
      const result = await api.get('tgt-1', { project_id: 'proj-1' });

      expect(paths[0]).toBe('/workflows/projects/proj-1/entities');
      expect(paths[1]).toBe(
        '/workflows/projects/proj-1/entities/connections/tgt-1?workflow_id=wf-1'
      );
      expect(result.connection_id).toBe('tgt-1');
    });

    it('uses explicit workflow_id without listing', async () => {
      const paths: string[] = [];
      const http = {
        get: async (path: string) => {
          paths.push(path);
          return { success: true as const, data: target };
        },
      } as unknown as LoxtepHttpClient;

      const api = createTargetsApi(http);
      await api.get('tgt-1', { project_id: 'proj-1', workflow_id: 'wf-1' });

      expect(paths).toEqual([
        '/workflows/projects/proj-1/entities/connections/tgt-1?workflow_id=wf-1',
      ]);
    });

    it('errors when connection is missing from list', async () => {
      const http = {
        get: async () => ({ success: true as const, data: { connections: [] } }),
      } as unknown as LoxtepHttpClient;

      const api = createTargetsApi(http);
      await expect(api.get('missing', { project_id: 'proj-1' })).rejects.toThrow(/not found/);
    });

    it('errors when multiple workflows own the same connection_id', async () => {
      const http = {
        get: async () => ({
          success: true as const,
          data: {
            connections: [
              { ...target, workflow_id: 'wf-a' },
              { ...target, workflow_id: 'wf-b' },
            ],
          },
        }),
      } as unknown as LoxtepHttpClient;

      const api = createTargetsApi(http);
      await expect(api.get('tgt-1', { project_id: 'proj-1' })).rejects.toThrow(
        /Multiple workflows/
      );
    });

    it('errors when listed connection has no workflow_id', async () => {
      const http = {
        get: async () => ({
          success: true as const,
          data: {
            connections: [{ ...target, workflow_id: null }],
          },
        }),
      } as unknown as LoxtepHttpClient;

      const api = createTargetsApi(http);
      await expect(api.get('tgt-1', { project_id: 'proj-1' })).rejects.toThrow(
        /no workflow_id/
      );
    });
  });

  describe('list', () => {
    function httpWithConnections(connections: Target[]): LoxtepHttpClient {
      return {
        get: async () => ({ success: true as const, data: { connections } }),
      } as unknown as LoxtepHttpClient;
    }

    it('filters by direction, search, type, status, and workflow_id', async () => {
      const api = createTargetsApi(httpWithConnections([target, inbound]));

      const byDirection = await api.list({
        project_id: 'proj-1',
        direction: 'outbound',
      });
      expect(byDirection.items.map(t => t.connection_id)).toEqual(['tgt-1']);

      const bySearch = await api.list({ project_id: 'proj-1', search: 'delivery' });
      expect(bySearch.items).toHaveLength(1);
      expect(bySearch.items[0]!.key).toBe('delivery-out');

      const byType = await api.list({ project_id: 'proj-1', type: 'sdk' });
      expect(byType.items.map(t => t.connection_id)).toEqual(['tgt-in']);

      const byStatus = await api.list({ project_id: 'proj-1', status: ['draft'] });
      expect(byStatus.items).toHaveLength(1);

      const byWorkflow = await api.list({ project_id: 'proj-1', workflow_id: 'wf-2' });
      expect(byWorkflow.items.map(t => t.connection_id)).toEqual(['tgt-in']);
    });

    it('paginates results', async () => {
      const many = Array.from({ length: 5 }, (_, i) => ({
        ...target,
        connection_id: `tgt-${i}`,
        name: `T${i}`,
        key: `t-${i}`,
      }));
      const api = createTargetsApi(httpWithConnections(many));

      const page1 = await api.list({ project_id: 'proj-1', page: 1, page_size: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.pagination).toMatchObject({
        page: 1,
        page_size: 2,
        total: 5,
        total_pages: 3,
        has_next: true,
        has_prev: false,
      });

      const page2 = await api.list({ project_id: 'proj-1', page: 2, page_size: 2 });
      expect(page2.items).toHaveLength(2);
      expect(page2.pagination.has_prev).toBe(true);
      expect(page2.pagination.has_next).toBe(true);
    });

    it('matches direction from configuration or metadata when top-level omitted', async () => {
      const viaConfig: Target = {
        ...target,
        connection_id: 'via-cfg',
        direction: undefined,
        configuration: { direction: 'outbound' },
        metadata: {},
      };
      const viaMeta: Target = {
        ...target,
        connection_id: 'via-meta',
        direction: undefined,
        configuration: {},
        metadata: { direction: 'outbound' },
      };
      const api = createTargetsApi(httpWithConnections([viaConfig, viaMeta, inbound]));
      const result = await api.list({ project_id: 'proj-1', direction: 'outbound' });
      expect(result.items.map(t => t.connection_id).sort()).toEqual(['via-cfg', 'via-meta']);
    });
  });

  describe('create', () => {
    it('requires workflow_id', async () => {
      const http = { put: async () => ({ success: true as const, data: target }) } as unknown as LoxtepHttpClient;
      const api = createTargetsApi(http);
      await expect(
        api.create({
          project_id: 'proj-1',
          workflow_id: '' as unknown as string,
          name: 'X',
          type: 'webhook',
        })
      ).rejects.toThrow(/requires workflow_id/);
    });

    it('creates via PUT and returns response data', async () => {
      let putPath = '';
      let putBody: unknown;
      const http = {
        put: async (path: string, body: unknown) => {
          putPath = path;
          putBody = body;
          return { success: true as const, data: { ...(body as Target), name: 'Echo' } };
        },
      } as unknown as LoxtepHttpClient;

      const api = createTargetsApi(http);
      const created = await api.create({
        project_id: 'proj-1',
        workflow_id: 'wf-1',
        name: 'Echo',
        type: 'webhook',
        connector_id: 'conn-1',
      });

      expect(putPath).toMatch(
        /^\/workflows\/projects\/proj-1\/entities\/connections\/[^?]+\?workflow_id=wf-1$/
      );
      expect(putBody).toMatchObject({
        project_id: 'proj-1',
        workflow_id: 'wf-1',
        name: 'Echo',
        type: 'webhook',
        direction: 'outbound',
        draft: true,
      });
      expect(created.name).toBe('Echo');
      expect(created.connection_id).toBeTruthy();
    });
  });

  describe('update / delete / test', () => {
    it('update merges and PUTs', async () => {
      const paths: string[] = [];
      const http = {
        get: async (path: string) => {
          paths.push(path);
          return { success: true as const, data: target };
        },
        put: async (_path: string, body: unknown) => ({
          success: true as const,
          data: body as Target,
        }),
      } as unknown as LoxtepHttpClient;

      const api = createTargetsApi(http);
      const updated = await api.update(
        'tgt-1',
        { name: 'Renamed' },
        { project_id: 'proj-1', workflow_id: 'wf-1' }
      );

      expect(updated.name).toBe('Renamed');
      expect(updated.connection_id).toBe('tgt-1');
      expect(paths[0]).toContain('workflow_id=wf-1');
    });

    it('delete calls http.delete with resolved workflow_id', async () => {
      const deleted: string[] = [];
      const http = {
        get: async () => ({ success: true as const, data: { connections: [target] } }),
        delete: async (path: string) => {
          deleted.push(path);
        },
      } as unknown as LoxtepHttpClient;

      const api = createTargetsApi(http);
      await api.delete('tgt-1', { project_id: 'proj-1' });

      expect(deleted).toEqual([
        '/workflows/projects/proj-1/entities/connections/tgt-1?workflow_id=wf-1',
      ]);
    });

    it('test loads target and returns success payload', async () => {
      const http = {
        get: async () => ({ success: true as const, data: target }),
      } as unknown as LoxtepHttpClient;

      const api = createTargetsApi(http);
      const result = await api.test('tgt-1', {
        project_id: 'proj-1',
        workflow_id: 'wf-1',
      });

      expect(result.success).toBe(true);
      expect(result.connection_id).toBe('tgt-1');
      expect(result.message).toContain('Delivery Out');
    });
  });

  describe('requireProjectId', () => {
    const http = {
      get: async () => ({ success: true as const, data: target }),
      put: async () => ({ success: true as const, data: target }),
      delete: async () => undefined,
    } as unknown as LoxtepHttpClient;

    it('errors on get/list/create/update/delete without project_id', async () => {
      const api = createTargetsApi(http);

      await expect(api.get('tgt-1')).rejects.toThrow(/targets\.get requires project_id/);
      await expect(api.list()).rejects.toThrow(/targets\.list requires project_id/);
      await expect(
        api.create({
          project_id: '' as unknown as string,
          workflow_id: 'wf-1',
          name: 'X',
          type: 'webhook',
        })
      ).rejects.toThrow(/targets\.create requires project_id/);
      await expect(api.update('tgt-1', { name: 'Y' })).rejects.toThrow(
        /targets\.update requires project_id/
      );
      await expect(api.delete('tgt-1')).rejects.toThrow(/targets\.delete requires project_id/);
    });
  });
});
