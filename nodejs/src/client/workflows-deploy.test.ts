import { createWorkflowsApi } from './workflows.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createWorkflowsApi deploy (#4867)', () => {
  it('throws when instance_id is missing or blank', async () => {
    const http = { post: jest.fn() } as unknown as LoxtepHttpClient;
    const api = createWorkflowsApi(http);

    await expect(
      api.deploy({ project_id: 'proj-1', instance_id: '' }),
    ).rejects.toThrow(/Instance id is required for deploy/);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('posts instance_id and optional expected_environment_key', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const http = {
      post: async (_path: string, body: Record<string, unknown>) => {
        capturedBody = body;
        return { success: true, data: { run_id: 'run-1', status: 'pending' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createWorkflowsApi(http);
    await api.deploy({
      project_id: 'proj-1',
      instance_id: 'inst-1',
      expected_environment_key: 'stage',
      force_redeploy: true,
    });

    expect(capturedBody).toEqual({
      instance_id: 'inst-1',
      version_id: undefined,
      force_redeploy: true,
      expected_environment_key: 'stage',
    });
  });
});