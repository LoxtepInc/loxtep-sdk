import {
  toDataProductListSummary,
  toDomainListSummary,
  toTriggerListSummary,
} from './list-summaries.js';
import type { DataProduct } from './data-products-types.js';
import type { Domain } from './domains-types.js';
import type { Trigger } from './trigger-types.js';

describe('list summaries', () => {
  it('prunes domain rows to configuration fields', () => {
    const full: Domain = {
      domain_id: 'd-1',
      organization_id: 'org-hidden',
      name: 'Commerce',
      description: 'Retail domain',
      owner_user_id: 'user-1',
      instance_id: 'inst-1',
      domain_type: 'business',
      status: 'active',
      visibility: 'internal',
      is_council: false,
      parent_domain_id: null,
      metadata: { tags: ['pii'], nested: { deep: true } },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };

    expect(toDomainListSummary(full)).toEqual({
      domain_id: 'd-1',
      name: 'Commerce',
      description: 'Retail domain',
      status: 'active',
      domain_type: 'business',
      visibility: 'internal',
      instance_id: 'inst-1',
      is_council: false,
      owner_user_id: 'user-1',
    });
    expect(toDomainListSummary(full)).not.toHaveProperty('metadata');
    expect(toDomainListSummary(full)).not.toHaveProperty('organization_id');
  });

  it('prunes data product rows without schema or deployment blobs', () => {
    const full = {
      data_product_id: 'dp-1',
      organization_id: 'org-hidden',
      domain_id: 'd-1',
      project_id: 'p-1',
      name: 'Orders',
      description: 'All orders',
      kind: 'source',
      status: 'active',
      owner: { user_id: 'u-1' },
      schema: { fields: [{ name: 'id' }] },
      storage: { graph: {}, rstreams_queue: 'q-1' },
      deployment_bindings: { deployment_id: 'dep-1' },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    } as DataProduct;

    expect(toDataProductListSummary(full)).toEqual({
      data_product_id: 'dp-1',
      name: 'Orders',
      kind: 'source',
      status: 'active',
      domain_id: 'd-1',
      project_id: 'p-1',
    });
  });

  it('prunes trigger rows without credential payload', () => {
    const full: Trigger = {
      connection_id: 'c-1',
      organization_id: 'org-hidden',
      key: 'shopify',
      name: 'Shopify',
      type: 'api',
      status: 'active',
      data: '{"api_key":"secret"}',
      configuration: { oauth_token: 'nope' },
      metadata: { internal: true },
      verified: true,
      draft: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };

    expect(toTriggerListSummary(full)).toEqual({
      connection_id: 'c-1',
      name: 'Shopify',
      key: 'shopify',
      type: 'api',
      status: 'active',
      verified: true,
      draft: false,
    });
  });
});
