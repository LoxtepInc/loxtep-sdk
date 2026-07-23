import { parseInstanceDetailResponse } from './instance-detail-response.js';

describe('parseInstanceDetailResponse', () => {
  const sampleInstance = {
    instance_id: 'a9da8b2d-5ef0-44ba-80c9-9039f5b9a8f0',
    organization_id: 'org-1',
    name: 'Patch Prod',
    api_url: 'https://api.loxtep.io',
    region: 'us-east-1',
    stack_id: 'stack-1',
    status: 'active',
    connection_details: {},
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('parses production envelope with instance as data directly', () => {
    const parsed = parseInstanceDetailResponse({
      success: true,
      data: sampleInstance,
    });
    expect(parsed.instance_id).toBe(sampleInstance.instance_id);
    expect(parsed.name).toBe('Patch Prod');
  });

  it('parses mock envelope with nested instance key', () => {
    const parsed = parseInstanceDetailResponse({
      success: true,
      data: {
        instance: sampleInstance,
        organization_id: 'org-1',
      },
    });
    expect(parsed.instance_id).toBe(sampleInstance.instance_id);
  });

  it('unwraps double-nested success envelopes', () => {
    const parsed = parseInstanceDetailResponse({
      success: true,
      data: {
        success: true,
        data: sampleInstance,
      },
    });
    expect(parsed.instance_id).toBe(sampleInstance.instance_id);
  });

  it('accepts a bare instance record', () => {
    const parsed = parseInstanceDetailResponse(sampleInstance);
    expect(parsed.instance_id).toBe(sampleInstance.instance_id);
  });

  it('throws when instance is missing', () => {
    expect(() =>
      parseInstanceDetailResponse({ success: true, data: { message: 'OK' } })
    ).toThrow(/Instance not found/);
  });
});
