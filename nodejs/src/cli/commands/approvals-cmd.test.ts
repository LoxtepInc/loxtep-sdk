import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { ApprovalRequest, ApprovalDecisionResult } from '../../client/approvals-types.js';
import {
  runApprovalsListCommand,
  runApprovalsApproveCommand,
  runApprovalsRejectCommand,
  parseApprovalsListNumericFlags,
} from './approvals-cmd.js';

function makeApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    approval_request_id: 'ar_001',
    organization_id: 'org1',
    workflow_name: 'orders-sync',
    operation_name: 'review-mapping',
    target_resource: 'dp1',
    requesting_actor: 'system',
    status: 'pending',
    expires_at: '2026-01-01T00:00:00Z',
    decided_by_user_id: null,
    decided_at: null,
    metadata: {},
    created_at: '2025-12-01T00:00:00Z',
    updated_at: '2025-12-01T00:00:00Z',
    ...overrides,
  };
}

function mockClient(opts: {
  items?: ApprovalRequest[];
  listError?: Error;
  decideResult?: ApprovalDecisionResult;
  decideError?: Error;
  onList?: (filters: unknown) => void;
  onApprove?: (id: string, options: unknown) => void;
  onReject?: (id: string, options: unknown) => void;
}): LoxtepClient {
  return {
    review: {
      approvals: {
        list: async (filters?: unknown) => {
          opts.onList?.(filters);
          if (opts.listError) throw opts.listError;
          return { items: opts.items ?? [] };
        },
        approve: async (id: string, options?: unknown) => {
          opts.onApprove?.(id, options);
          if (opts.decideError) throw opts.decideError;
          return opts.decideResult ?? { approval_request_id: id, status: 'approved' };
        },
        reject: async (id: string, options?: unknown) => {
          opts.onReject?.(id, options);
          if (opts.decideError) throw opts.decideError;
          return opts.decideResult ?? { approval_request_id: id, status: 'rejected' };
        },
      },
    },
  } as unknown as LoxtepClient;
}

describe('loxtep approvals list', () => {
  it('defaults status to pending', async () => {
    let captured: unknown;
    const client = mockClient({
      items: [makeApproval()],
      onList: filters => {
        captured = filters;
      },
    });

    const result = await runApprovalsListCommand(client);
    expect(result.exitCode).toBe(0);
    expect(captured).toEqual({ status: 'pending' });
    const parsed = JSON.parse(result.stdout[0]!) as { items: Array<{ approval_request_id: string }> };
    expect(parsed.items[0]?.approval_request_id).toBe('ar_001');
  });

  it('passes status, page, and page_size filters', async () => {
    let captured: unknown;
    const client = mockClient({
      onList: filters => {
        captured = filters;
      },
    });

    await runApprovalsListCommand(client, { status: 'approved', page: 2, page_size: 10 });
    expect(captured).toEqual({ status: 'approved', page: 2, page_size: 10 });
  });

  it('passes organization_id filter when provided', async () => {
    let captured: unknown;
    const client = mockClient({
      onList: filters => {
        captured = filters;
      },
    });

    await runApprovalsListCommand(client, { organization_id: 'org-9' });
    expect(captured).toEqual({ status: 'pending', organization_id: 'org-9' });
  });

  it('rejects invalid status filter', async () => {
    const result = await runApprovalsListCommand(mockClient({}), { status: 'nope' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Invalid status filter');
  });

  it('reports API errors with non-zero exit', async () => {
    const result = await runApprovalsListCommand(
      mockClient({ listError: new Error('Unauthorized') })
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Unauthorized');
  });
});

describe('loxtep approvals approve/reject', () => {
  it('approve forwards response and form_response', async () => {
    let capturedId: string | undefined;
    let capturedOpts: unknown;
    const client = mockClient({
      onApprove: (id, options) => {
        capturedId = id;
        capturedOpts = options;
      },
      decideResult: { approval_request_id: 'ar_001', status: 'approved', decided_at: '2026-01-02T00:00:00Z' },
    });

    const result = await runApprovalsApproveCommand(client, 'ar_001', {
      response: 'yes',
      form_response_json: '{"note":"ok"}',
    });

    expect(result.exitCode).toBe(0);
    expect(capturedId).toBe('ar_001');
    expect(capturedOpts).toEqual({ response: 'yes', form_response: { note: 'ok' } });
    expect(JSON.parse(result.stdout[0]!)).toEqual({
      approval_request_id: 'ar_001',
      status: 'approved',
      decided_at: '2026-01-02T00:00:00Z',
    });
  });

  it('reject validates form-response JSON', async () => {
    const result = await runApprovalsRejectCommand(mockClient({}), 'ar_001', {
      form_response_json: 'not-json',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Invalid --form-response');
  });

  it('reject reports API errors', async () => {
    const result = await runApprovalsRejectCommand(
      mockClient({ decideError: new Error('already decided') }),
      'ar_001'
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('already decided');
  });
});

describe('parseApprovalsListNumericFlags', () => {
  it('parses valid page flags', () => {
    expect(parseApprovalsListNumericFlags({ page: '2', page_size: '25' })).toEqual({
      ok: true,
      page: 2,
      page_size: 25,
    });
  });

  it('rejects non-positive page', () => {
    const result = parseApprovalsListNumericFlags({ page: '0' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('--page');
  });
});
