import { createDeploymentsApi } from './deployments.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createDeploymentsApi', () => {
  const deployment = {
    deployment_id: 'dep-1',
    project_id: 'proj-1',
    instance_id: 'inst-1',
    name: 'SDK App Events Ingest',
    type: 'workflow' as const,
    status: 'pending' as const,
    created_at: '2026-08-06T21:30:00Z',
    updated_at: '2026-08-06T21:30:00Z',
  };

  it('list calls GET /workflows/deployments with filters', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { items: [deployment], pagination: { page: 1 } } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createDeploymentsApi(http);
    const result = await api.list({
      project_id: 'proj-1',
      workflow_id: 'wf-1',
      status: 'pending',
      page: 2,
    });

    expect(capturedPath).toContain('/workflows/deployments?');
    expect(capturedPath).toContain('project_id=proj-1');
    expect(capturedPath).toContain('workflow_id=wf-1');
    expect(capturedPath).toContain('status=pending');
    expect(capturedPath).toContain('page=2');
    expect(result.items).toEqual([deployment]);
  });

  it('get calls GET /workflows/deployments/:id', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: deployment };
      },
    } as unknown as LoxtepHttpClient;

    const api = createDeploymentsApi(http);
    const result = await api.get('dep-1', { include_versions: true });

    expect(capturedPath).toBe('/workflows/deployments/dep-1?include_versions=true');
    expect(result).toEqual(deployment);
  });
});
