import { deriveKey, normalizeContext } from './normalize.js';
import type { WorkspaceContext } from './types.js';

describe('deriveKey', () => {
  it('lowercases the name', () => {
    expect(deriveKey('MyDataProduct')).toBe('mydataproduct');
  });

  it('replaces runs of non-alphanumeric chars with a single underscore', () => {
    expect(deriveKey('shopify--gql  customer')).toBe('shopify_gql_customer');
    expect(deriveKey('hello@#$%world')).toBe('hello_world');
  });

  it('trims leading and trailing underscores', () => {
    expect(deriveKey('---hello---')).toBe('hello');
    expect(deriveKey('___test___')).toBe('test');
  });

  it('prefixes with _ when result is empty', () => {
    expect(deriveKey('')).toBe('_');
    expect(deriveKey('!!!')).toBe('_');
    expect(deriveKey('---')).toBe('_');
  });

  it('prefixes with _ when result starts with a digit', () => {
    expect(deriveKey('123abc')).toBe('_123abc');
    expect(deriveKey('9things')).toBe('_9things');
  });

  it('does not prefix when result starts with a letter', () => {
    expect(deriveKey('abc123')).toBe('abc123');
  });

  it('handles mixed cases with special characters', () => {
    expect(deriveKey('Shopify_GQL_Customer')).toBe('shopify_gql_customer');
    expect(deriveKey('my-data-product')).toBe('my_data_product');
    expect(deriveKey('UPPER CASE NAME')).toBe('upper_case_name');
  });

  it('handles single character names', () => {
    expect(deriveKey('a')).toBe('a');
    expect(deriveKey('1')).toBe('_1');
    expect(deriveKey('_')).toBe('_');
  });
});

describe('normalizeContext', () => {
  const emptyContext: WorkspaceContext = {
    dataProducts: [],
    connectors: [],
    domains: [],
    queues: [],
    flows: [],
    workflows: [],
  };

  it('returns empty arrays for empty context', () => {
    const result = normalizeContext(emptyContext);

    expect(result.dataProducts).toEqual([]);
    expect(result.connectors).toEqual([]);
    expect(result.domains).toEqual([]);
    expect(result.queues).toEqual([]);
    expect(result.flows).toEqual([]);
    expect(result.workflows).toEqual([]);
  });

  it('sorts resources by id in ascending order', () => {
    const ctx: WorkspaceContext = {
      ...emptyContext,
      dataProducts: [
        { name: 'zebra', id: 'dp-3', domain: null, schema: null },
        { name: 'alpha', id: 'dp-1', domain: null, schema: null },
        { name: 'beta', id: 'dp-2', domain: null, schema: null },
      ],
    };

    const result = normalizeContext(ctx);

    expect(result.dataProducts.map(r => r.data.id)).toEqual(['dp-1', 'dp-2', 'dp-3']);
  });

  it('derives deterministic keys from resource names', () => {
    const ctx: WorkspaceContext = {
      ...emptyContext,
      queues: [
        { name: 'Orders Raw', id: 'q-1' },
        { name: 'orders-processed', id: 'q-2' },
      ],
    };

    const result = normalizeContext(ctx);

    expect(result.queues[0].key).toBe('orders_raw');
    expect(result.queues[1].key).toBe('orders_processed');
  });

  it('resolves collisions with _2, _3 suffixes in id-sorted order', () => {
    const ctx: WorkspaceContext = {
      ...emptyContext,
      dataProducts: [
        { name: 'My Product', id: 'dp-3', domain: null, schema: null },
        { name: 'my-product', id: 'dp-1', domain: null, schema: null },
        { name: 'MY_PRODUCT', id: 'dp-2', domain: null, schema: null },
      ],
    };

    const result = normalizeContext(ctx);

    // All derive to 'my_product'. In id-sorted order: dp-1, dp-2, dp-3
    expect(result.dataProducts[0]).toEqual({
      key: 'my_product',
      data: { name: 'my-product', id: 'dp-1', domain: null, schema: null },
    });
    expect(result.dataProducts[1]).toEqual({
      key: 'my_product_2',
      data: { name: 'MY_PRODUCT', id: 'dp-2', domain: null, schema: null },
    });
    expect(result.dataProducts[2]).toEqual({
      key: 'my_product_3',
      data: { name: 'My Product', id: 'dp-3', domain: null, schema: null },
    });
  });

  it('handles collisions across different resource types independently', () => {
    const ctx: WorkspaceContext = {
      ...emptyContext,
      queues: [
        { name: 'orders', id: 'q-1' },
        { name: 'ORDERS', id: 'q-2' },
      ],
      flows: [
        { name: 'orders', id: 'f-1' },
        { name: 'ORDERS', id: 'f-2' },
      ],
    };

    const result = normalizeContext(ctx);

    // Queues: q-1 gets 'orders', q-2 gets 'orders_2'
    expect(result.queues[0].key).toBe('orders');
    expect(result.queues[1].key).toBe('orders_2');

    // Flows: same collision resolution independently
    expect(result.flows[0].key).toBe('orders');
    expect(result.flows[1].key).toBe('orders_2');
  });

  it('produces identical output for the same input (deterministic)', () => {
    const ctx: WorkspaceContext = {
      ...emptyContext,
      dataProducts: [
        { name: 'beta', id: 'dp-2', domain: 'dom-1', schema: null },
        { name: 'alpha', id: 'dp-1', domain: 'dom-1', schema: { type: 'object' } },
      ],
      connectors: [
        { type: 'shopify', id: 'cn-2', connection_id: 'conn-1', name: 'Shopify B' },
        { type: 'postgres', id: 'cn-1', connection_id: 'conn-2', name: 'Postgres A' },
      ],
    };

    const result1 = normalizeContext(ctx);
    const result2 = normalizeContext(ctx);

    expect(result1).toEqual(result2);
  });

  it('preserves all original data in the NormalizedResource', () => {
    const ctx: WorkspaceContext = {
      ...emptyContext,
      dataProducts: [
        { name: 'orders', id: 'dp-1', domain: 'commerce', schema: { type: 'object', properties: { id: { type: 'string' } } } },
      ],
    };

    const result = normalizeContext(ctx);

    expect(result.dataProducts[0].data).toEqual({
      name: 'orders',
      id: 'dp-1',
      domain: 'commerce',
      schema: { type: 'object', properties: { id: { type: 'string' } } },
    });
  });

  it('normalizes connectors with the name field for key derivation', () => {
    const ctx: WorkspaceContext = {
      ...emptyContext,
      connectors: [
        { type: 'shopify', id: 'cn-1', connection_id: 'conn-1', name: 'Shopify Main' },
        { type: 'postgres', id: 'cn-2', connection_id: 'conn-2', name: 'Production DB' },
      ],
    };

    const result = normalizeContext(ctx);

    expect(result.connectors[0].key).toBe('shopify_main');
    expect(result.connectors[1].key).toBe('production_db');
  });
});
