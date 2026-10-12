import { createGovernanceApi } from './governance.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createGovernanceApi policies', () => {
  it('list GETs /governance/policies and unwraps data', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { items: [{ policy_id: 'p1', name: 'Freeze' }] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createGovernanceApi(http, { organization_id: 'org1' });
    const result = await api.policies.list({
      page: 2,
      page_size: 10,
      search: 'freeze',
      domain_id: 'dom-1',
      include_org_policies: false,
      type: 'data_governance',
    });

    expect(capturedPath).toBe(
      '/governance/policies?page=2&page_size=10&search=freeze&domain_id=dom-1&include_org_policies=false&type=data_governance'
    );
    expect(result.items?.[0]?.policy_id).toBe('p1');
  });

  it('create POSTs the body without organization_id', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: { policy_id: 'p1', name: 'Gate' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createGovernanceApi(http, { organization_id: 'org1' });
    const result = await api.policies.create({
      name: 'Gate',
      rules: [{ condition: 'true', action: 'deny', resources: ['*'] }],
      enforcement: 'block',
      organization_id: 'org1',
    });

    expect(capturedPath).toBe('/governance/policies');
    expect(capturedBody).toEqual({
      name: 'Gate',
      rules: [{ condition: 'true', action: 'deny', resources: ['*'] }],
      enforcement: 'block',
    });
    expect(result.policy_id).toBe('p1');
  });

  it('update PUTs a partial body and omits policy_id', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      put: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: { policy_id: 'p1', name: 'Renamed' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createGovernanceApi(http, { organization_id: 'org1' });
    await api.policies.update('p1', { policy_id: 'p1', name: 'Renamed', description: undefined });

    expect(capturedPath).toBe('/governance/policies/p1');
    expect(capturedBody).toEqual({ name: 'Renamed' });
  });

  it('get and delete use the policy path', async () => {
    const paths: string[] = [];
    const http = {
      get: async (path: string) => {
        paths.push(path);
        return { success: true as const, data: { policy_id: 'p1' } };
      },
      delete: async (path: string) => {
        paths.push(path);
        return { success: true as const, data: { deleted: true } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createGovernanceApi(http, { organization_id: 'org1' });
    await api.policies.get('p1');
    await api.policies.delete('p1');
    expect(paths).toEqual(['/governance/policies/p1', '/governance/policies/p1']);
  });
});

describe('createGovernanceApi access_requests', () => {
  it('create POSTs resource fields', async () => {
    let capturedBody: unknown = null;
    const http = {
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return { success: true as const, data: { access_request_id: 'ar1', status: 'pending' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createGovernanceApi(http, { organization_id: 'org1' });
    const result = await api.access_requests.create({
      resource_type: 'data_product',
      resource_id: '11111111-1111-1111-1111-111111111111',
      access_type: 'consume',
      justification: 'Need this product for the orders flow.',
    });

    expect(capturedBody).toEqual({
      resource_type: 'data_product',
      resource_id: '11111111-1111-1111-1111-111111111111',
      access_type: 'consume',
      justification: 'Need this product for the orders flow.',
    });
    expect(result.access_request_id).toBe('ar1');
  });

  it('list GETs filters and decide PUTs action without the id in the body', async () => {
    let capturedGet: string | null = null;
    let capturedPut: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      get: async (path: string) => {
        capturedGet = path;
        return { success: true as const, data: { items: [] } };
      },
      put: async (path: string, body: unknown) => {
        capturedPut = path;
        capturedBody = body;
        return { success: true as const, data: { access_request_id: 'ar1', status: 'rejected' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createGovernanceApi(http, { organization_id: 'org1' });
    await api.access_requests.list({
      page: 1,
      status: 'pending',
      resource_type: 'domain',
      resource_id: '22222222-2222-2222-2222-222222222222',
    });
    await api.access_requests.decide('ar1', {
      action: 'reject',
      rejection_reason: 'Not now',
      access_request_id: 'ar1',
    });

    expect(capturedGet).toBe(
      '/governance/access-requests?page=1&status=pending&resource_type=domain&resource_id=22222222-2222-2222-2222-222222222222'
    );
    expect(capturedPut).toBe('/governance/access-requests/ar1');
    expect(capturedBody).toEqual({ action: 'reject', rejection_reason: 'Not now' });
  });

  it('throws when organization_id is missing', async () => {
    const http = {
      get: async () => ({ success: true as const, data: {} }),
    } as unknown as LoxtepHttpClient;
    const api = createGovernanceApi(http);
    await expect(api.policies.list()).rejects.toThrow('organization_id is required');
  });
});
