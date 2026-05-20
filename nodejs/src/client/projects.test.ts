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
});
