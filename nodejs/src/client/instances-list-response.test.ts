import {
  instancesListLooksEmpty,
  parseInstancesListResponse,
} from './instances-list-response.js';

describe('parseInstancesListResponse', () => {
  const sampleInstance = {
    instance_id: 'i1',
    organization_id: 'o1',
    name: 'Shared Dev',
    api_url: 'https://api.loxtep.io',
    region: 'us-east-1',
    stack_id: 'stack-1',
    status: 'active',
    connection_details: {},
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('parses standard paginated envelope', () => {
    const parsed = parseInstancesListResponse({
      success: true,
      data: {
        items: [sampleInstance],
        pagination: {
          page: 1,
          page_size: 20,
          total: 1,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      },
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.instance_id).toBe('i1');
    expect(parsed.pagination.total).toBe(1);
  });

  it('unwraps double-nested success envelopes', () => {
    const parsed = parseInstancesListResponse({
      success: true,
      data: {
        success: true,
        data: {
          items: [sampleInstance],
          pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
        },
      },
    });

    expect(parsed.items).toHaveLength(1);
  });

  it('accepts data as a bare instance array', () => {
    const parsed = parseInstancesListResponse({
      success: true,
      data: [sampleInstance],
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.pagination.total).toBe(1);
  });

  it('accepts data.instances instead of data.items', () => {
    const parsed = parseInstancesListResponse({
      success: true,
      data: {
        instances: [sampleInstance],
      },
    });

    expect(parsed.items).toHaveLength(1);
  });

  it('accepts a bare top-level array', () => {
    const parsed = parseInstancesListResponse([sampleInstance]);
    expect(parsed.items).toHaveLength(1);
  });
});
