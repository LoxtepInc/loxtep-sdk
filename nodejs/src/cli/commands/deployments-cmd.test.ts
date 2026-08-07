import type { LoxtepClient } from '../../client/loxtep-client.js';
import { runDeploymentsGetCommand, runDeploymentsListCommand } from './deployments-cmd.js';

function mockClient(overrides: {
  list?: jest.Mock;
  get?: jest.Mock;
}): LoxtepClient {
  return {
    observe: {
      list_deployments: overrides.list ?? jest.fn(async () => ({ items: [] })),
      get_deployment: overrides.get ?? jest.fn(async () => ({ deployment_id: 'dep-1' })),
    },
  } as unknown as LoxtepClient;
}

describe('deployments-cmd', () => {
  it('lists deployments with filters', async () => {
    const list = jest.fn(async () => ({
      items: [{ deployment_id: 'dep-1', status: 'pending' }],
    }));
    const result = await runDeploymentsListCommand(mockClient({ list }), {
      project_id: 'proj-1',
      status: 'pending',
    });
    expect(result.exitCode).toBe(0);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'proj-1', status: 'pending' })
    );
    expect(result.stdout[0]).toContain('dep-1');
  });

  it('rejects invalid status', async () => {
    const result = await runDeploymentsListCommand(mockClient({}), { status: 'requested' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Invalid status filter');
  });

  it('gets a deployment by id', async () => {
    const get = jest.fn(async () => ({ deployment_id: 'dep-1', status: 'deployed' }));
    const result = await runDeploymentsGetCommand(mockClient({ get }), 'dep-1', {
      include_versions: true,
    });
    expect(result.exitCode).toBe(0);
    expect(get).toHaveBeenCalledWith('dep-1', { include_versions: true });
    expect(result.stdout[0]).toContain('deployed');
  });
});
