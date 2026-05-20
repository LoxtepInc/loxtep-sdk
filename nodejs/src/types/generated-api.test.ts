/**
 * Verify generated API types compile and are usable (LOX-970).
 */

import type {
  PaginationMetaApi,
  DataProductApi,
  FlowApi,
  ConnectionApi,
  QueueEventApi,
  QualityMetricApi,
} from './generated-api.js';

describe('generated-api types', () => {
  it('PaginationMetaApi has snake_case fields', () => {
    const p: PaginationMetaApi = {
      page: 1,
      page_size: 20,
      total: 0,
      total_pages: 0,
      has_next: false,
      has_prev: false,
    };
    expect(p.page_size).toBe(20);
  });

  it('DataProductApi has data_product_id and snake_case', () => {
    const a: DataProductApi = {
      data_product_id: 'id',
      organization_id: 'org',
      domain_id: 'dom',
      name: 'n',
      description: 'd',
      status: 'active',
      owner: { user_id: 'u' },
      created_at: '',
      updated_at: '',
    };
    expect(a.data_product_id).toBe('id');
  });

  it('FlowApi and ConnectionApi are assignable', () => {
    const f: FlowApi = {
      workflow_id: 'p',
      project_id: 'proj',
      name: 'f',
      configuration: {},
      deployment: {},
      status: 'active',
      metrics: {},
      created_at: '',
      updated_at: '',
    };
    expect(f.workflow_id).toBe('p');

    const c: ConnectionApi = {
      connection_id: 'c',
      key: 'k',
      name: 'n',
      type: 'api',
      status: 'active',
      data: '',
      configuration: {},
      metadata: {},
      verified: false,
      draft: false,
      created_at: '',
      updated_at: '',
    };
    expect(c.connection_id).toBe('c');
  });

  it('QueueEventApi and QualityMetricApi are optional-heavy', () => {
    const q: QueueEventApi = {};
    const m: QualityMetricApi = { metric_id: 'm1' };
    expect(q).toBeDefined();
    expect(m.metric_id).toBe('m1');
  });
});
