import { createProjectsApi } from './projects.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createProjectsApi', () => {
  it('list calls GET /workflows/projects with query params and returns data', async () => {
    let capturedPath: string | null = null;
    const listData = {
      items: [{ project_id: 'p1', name: 'P1', status: 'active' }],
      pagination: {
        page: 1,
        page_size: 100,
        total: 1,
        total_pages: 1,
        has_next: false,
        has_prev: false,
      },
    };
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: listData };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProjectsApi(http);
    const result = await api.list({ page: 2, page_size: 50 });

    expect(capturedPath).toContain('/workflows/projects');
    expect(capturedPath).toContain('page=2');
    expect(capturedPath).toContain('page_size=50');
    expect(result).toEqual(listData);
  });

  it('get calls GET /workflows/projects/:id and returns project', async () => {
    let capturedPath: string | null = null;
    const project = { project_id: 'p1', name: 'P1', status: 'active' as const };
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: project };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProjectsApi(http);
    const result = await api.get('p1');

    expect(capturedPath).toBe('/workflows/projects/p1');
    expect(result).toEqual(project);
  });

  it('create calls POST /workflows/projects with body', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const project = { project_id: 'p1', name: 'New', status: 'active' as const };
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: project };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProjectsApi(http);
    const result = await api.create({ name: 'New' });

    expect(capturedPath).toBe('/workflows/projects');
    expect(capturedBody).toEqual({ name: 'New' });
    expect(result).toEqual(project);
  });

  it('update calls PUT /workflows/projects/:id with body', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const project = { project_id: 'p1', name: 'Updated', status: 'active' as const };
    const http = {
      put: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: project };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProjectsApi(http);
    const result = await api.update('p1', { name: 'Updated' });

    expect(capturedPath).toBe('/workflows/projects/p1');
    expect(capturedBody).toEqual({ name: 'Updated' });
    expect(result).toEqual(project);
  });

  it('delete calls DELETE /workflows/projects/:id', async () => {
    let capturedPath: string | null = null;
    const http = {
      delete: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { project_id: 'p1', deleted: true } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProjectsApi(http);
    const result = await api.delete('p1');

    expect(capturedPath).toBe('/workflows/projects/p1');
    expect(result).toEqual({ project_id: 'p1', deleted: true });
  });

  describe('repository', () => {
    it('returns binding fields from a fully-bound project with sync history', async () => {
      const project = {
        project_id: 'p1',
        organization_id: 'org1',
        name: 'P1',
        status: 'active' as const,
        is_active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        github_repo_url: 'https://github.com/acme/orders-mesh',
        github_repo_name: 'acme/orders-mesh',
        github_repo_path: 'packages/data',
        github_branch: 'develop',
        github_last_commit_sha: 'abc123def456',
        github_last_sync_at: '2025-06-01T12:00:00Z',
      };
      const http = {
        get: async () => ({ success: true as const, data: project }),
      } as unknown as LoxtepHttpClient;

      const api = createProjectsApi(http);
      const result = await api.repository('p1');

      expect(result).toEqual({
        url: 'https://github.com/acme/orders-mesh',
        name: 'acme/orders-mesh',
        subpath: 'packages/data',
        branch: 'develop',
        last_commit_sha: 'abc123def456',
        last_sync_at: '2025-06-01T12:00:00Z',
      });
    });

    it('returns empty last-synced values when project has never been synced', async () => {
      const project = {
        project_id: 'p1',
        organization_id: 'org1',
        name: 'P1',
        status: 'active' as const,
        is_active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        github_repo_url: 'https://github.com/acme/orders-mesh',
        github_repo_name: 'acme/orders-mesh',
        github_repo_path: '',
        github_branch: 'main',
        github_last_commit_sha: null,
        github_last_sync_at: null,
      };
      const http = {
        get: async () => ({ success: true as const, data: project }),
      } as unknown as LoxtepHttpClient;

      const api = createProjectsApi(http);
      const result = await api.repository('p1');

      expect(result).toEqual({
        url: 'https://github.com/acme/orders-mesh',
        name: 'acme/orders-mesh',
        subpath: '',
        branch: 'main',
        last_commit_sha: '',
        last_sync_at: '',
      });
    });

    it('returns null url/name and empty subpath/branch defaults when project is unbound', async () => {
      const project = {
        project_id: 'p1',
        organization_id: 'org1',
        name: 'P1',
        status: 'active' as const,
        is_active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        // No github_* fields
      };
      const http = {
        get: async () => ({ success: true as const, data: project }),
      } as unknown as LoxtepHttpClient;

      const api = createProjectsApi(http);
      const result = await api.repository('p1');

      expect(result).toEqual({
        url: null,
        name: null,
        subpath: '',
        branch: 'main',
        last_commit_sha: '',
        last_sync_at: '',
      });
    });

    it('calls GET /workflows/projects/:id to fetch the project record', async () => {
      let capturedPath: string | null = null;
      const project = {
        project_id: 'proj-xyz',
        organization_id: 'org1',
        name: 'P1',
        status: 'active' as const,
        is_active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      const http = {
        get: async (path: string) => {
          capturedPath = path;
          return { success: true as const, data: project };
        },
      } as unknown as LoxtepHttpClient;

      const api = createProjectsApi(http);
      await api.repository('proj-xyz');

      expect(capturedPath).toBe('/workflows/projects/proj-xyz');
    });
  });
});
