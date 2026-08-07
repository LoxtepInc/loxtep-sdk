import type { LoxtepClient } from '../../client/loxtep-client.js';
import {
  runApprovalsApproveCommand,
  runApprovalsListCommand,
  runApprovalsRejectCommand,
} from './approvals-cmd.js';

function mockClient(overrides: {
  organization_id?: string | null;
  list?: jest.Mock;
  approve?: jest.Mock;
  reject?: jest.Mock;
}): LoxtepClient {
  return {
    session: {
      get_current_user: async () =>
        overrides.organization_id
          ? { organization_id: overrides.organization_id }
          : {},
    },
    review: {
      approvals: {
        list: overrides.list ?? jest.fn(async () => ({ items: [] })),
        approve: overrides.approve ?? jest.fn(async () => ({ approval_request_id: 'ar1', status: 'approved' })),
        reject: overrides.reject ?? jest.fn(async () => ({ approval_request_id: 'ar1', status: 'rejected' })),
      },
    },
  } as unknown as LoxtepClient;
}

describe('approvals-cmd', () => {
  it('lists pending approvals', async () => {
    const list = jest.fn(async () => ({
      items: [{ approval_request_id: 'ar1', status: 'pending' }],
    }));
    const result = await runApprovalsListCommand(mockClient({ organization_id: 'org-1', list }), {
      status: 'pending',
    });
    expect(result.exitCode).toBe(0);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: 'org-1', status: 'pending' })
    );
    expect(result.stdout[0]).toContain('ar1');
  });

  it('rejects invalid status filter', async () => {
    const result = await runApprovalsListCommand(mockClient({ organization_id: 'org-1' }), {
      status: 'nope',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Invalid status filter');
  });

  it('approves by id', async () => {
    const approve = jest.fn(async () => ({ approval_request_id: 'ar1', status: 'approved' }));
    const result = await runApprovalsApproveCommand(
      mockClient({ organization_id: 'org-1', approve }),
      'ar1'
    );
    expect(result.exitCode).toBe(0);
    expect(approve).toHaveBeenCalledWith('ar1', 'org-1');
  });

  it('rejects by id', async () => {
    const reject = jest.fn(async () => ({ approval_request_id: 'ar1', status: 'rejected' }));
    const result = await runApprovalsRejectCommand(
      mockClient({ organization_id: 'org-1', reject }),
      'ar1'
    );
    expect(result.exitCode).toBe(0);
    expect(reject).toHaveBeenCalledWith('ar1', 'org-1');
  });
});
