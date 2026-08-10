import { createApprovalsApi } from './approvals.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createApprovalsApi', () => {
  const approval = {
    approval_request_id: 'ar1',
    organization_id: 'org1',
    workflow_name: 'define-data-product-semantics',
    operation_name: 'review-mapping',
    target_resource: 'dp1',
    requesting_actor: 'system',
    status: 'pending' as const,
    expires_at: '2026-01-01T00:00:00Z',
    decided_by_user_id: null,
    decided_at: null,
    metadata: {},
    required_approvals: 1,
    criteria_schema: { type: 'string', enum: ['yes', 'no'] },
    created_at: '2025-12-01T00:00:00Z',
    updated_at: '2025-12-01T00:00:00Z',
  };

  it('list calls GET .../approval-requests with query params and returns items', async () => {
    let capturedPath: string | null = null;
    const listData = { items: [approval] };
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: listData };
      },
    } as unknown as LoxtepHttpClient;

    const api = createApprovalsApi(http);
    const result = await api.list({ organization_id: 'org1', status: 'pending', page: 2, page_size: 50 });

    expect(capturedPath).toBe(
      '/agent-orchestration/organizations/org1/approval-requests?status=pending&page=2&page_size=50'
    );
    expect(result).toEqual({ items: [approval], pagination: undefined });
  });

  it('list tolerates bare { items, total } envelopes', async () => {
    const http = {
      get: async () => ({
        success: true as const,
        data: { items: [approval], total: 1 },
      }),
    } as unknown as LoxtepHttpClient;

    const api = createApprovalsApi(http, { organization_id: 'org1' });
    const result = await api.list();

    expect(result).toEqual({ items: [approval], total: 1, pagination: undefined });
  });

  it('list_pending defaults status to pending', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { items: [] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createApprovalsApi(http, { organization_id: 'org1' });
    await api.list_pending();

    expect(capturedPath).toBe('/agent-orchestration/organizations/org1/approval-requests?status=pending');
  });

  it('uses deps.organization_id when no override is passed', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { items: [] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createApprovalsApi(http, { organization_id: 'org-default' });
    await api.list();

    expect(capturedPath).toBe('/agent-orchestration/organizations/org-default/approval-requests');
  });

  it('throws when organization_id is missing from both deps and call', async () => {
    const http = {
      get: async () => ({ success: true as const, data: { items: [] } }),
    } as unknown as LoxtepHttpClient;

    const api = createApprovalsApi(http);

    await expect(api.list()).rejects.toThrow('organization_id is required');
  });

  it('resolve calls POST .../approval-requests/:id/approve with empty body by default', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const decision = { approval_request_id: 'ar1', status: 'approved', decided_at: '2025-12-02T00:00:00Z' };
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: decision };
      },
    } as unknown as LoxtepHttpClient;

    const api = createApprovalsApi(http);
    const result = await api.resolve('ar1', 'approve', 'org1');

    expect(capturedPath).toBe('/agent-orchestration/organizations/org1/approval-requests/ar1/approve');
    expect(capturedBody).toEqual({});
    expect(result).toEqual(decision);
  });

  it('resolve accepts options object with response and form_response body fields', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const decision = { approval_request_id: 'ar1', status: 'approved' };
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: decision };
      },
    } as unknown as LoxtepHttpClient;

    const api = createApprovalsApi(http, { organization_id: 'org1' });
    await api.resolve('ar1', 'approve', {
      response: 'yes',
      form_response: { note: 'looks good' },
    });

    expect(capturedPath).toBe('/agent-orchestration/organizations/org1/approval-requests/ar1/approve');
    expect(capturedBody).toEqual({
      response: 'yes',
      form_response: { note: 'looks good' },
    });
  });

  it('approve is a convenience wrapper around resolve and forwards body options', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const decision = { approval_request_id: 'ar1', status: 'approved' };
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: decision };
      },
    } as unknown as LoxtepHttpClient;

    const api = createApprovalsApi(http, { organization_id: 'org1' });
    const result = await api.approve('ar1', { response: 'approved' });

    expect(capturedPath).toBe('/agent-orchestration/organizations/org1/approval-requests/ar1/approve');
    expect(capturedBody).toEqual({ response: 'approved' });
    expect(result).toEqual(decision);
  });

  it('reject is a convenience wrapper around resolve', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const decision = { approval_request_id: 'ar1', status: 'rejected' };
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: decision };
      },
    } as unknown as LoxtepHttpClient;

    const api = createApprovalsApi(http, { organization_id: 'org1' });
    const result = await api.reject('ar1', { form_response: null });

    expect(capturedPath).toBe('/agent-orchestration/organizations/org1/approval-requests/ar1/reject');
    expect(capturedBody).toEqual({ form_response: null });
    expect(result).toEqual(decision);
  });
});
