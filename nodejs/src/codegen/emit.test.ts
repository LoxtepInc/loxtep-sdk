import { emitArtifact } from './emit.js';
import type { NormalizedContext } from './types.js';

describe('emitArtifact', () => {
  const emptyNorm: NormalizedContext = {
    dataProducts: [],
    connectors: [],
    domains: [],
    queues: [],
    flows: [],
    workflows: [],
  };

  it('produces a valid TypeScript source string', () => {
    const result = emitArtifact(emptyNorm);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the auto-generated header comment', () => {
    const result = emitArtifact(emptyNorm);
    expect(result).toContain('AUTO-GENERATED — do not edit');
  });

  it('includes a context hash in the header', () => {
    const result = emitArtifact(emptyNorm);
    expect(result).toMatch(/\/\/ Context hash: [0-9a-f]{8}/);
  });

  it('emits empty objects for empty collections', () => {
    const result = emitArtifact(emptyNorm);
    expect(result).toContain('export const dataProducts = {} as const;');
    expect(result).toContain('export const connectors = {} as const;');
    expect(result).toContain('export const domains = {} as const;');
    expect(result).toContain('export const queues = {} as const;');
    expect(result).toContain('export const flows = {} as const;');
    expect(result).toContain('export const workflows = {} as const;');
  });

  it('emits the workspace namespace aggregating all collections', () => {
    const result = emitArtifact(emptyNorm);
    expect(result).toContain(
      'export const workspace = { dataProducts, connectors, domains, queues, flows, workflows } as const;',
    );
  });

  it('emits data product constants with name, id, domain, and schema fields', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      dataProducts: [
        {
          key: 'orders',
          data: {
            name: 'orders',
            id: 'dp-1',
            domain: 'commerce',
            schema: { type: 'object', properties: { id: { type: 'string' } } },
          },
        },
      ],
    };
    const result = emitArtifact(norm);
    expect(result).toContain('export const dataProducts = {');
    expect(result).toContain('orders: {');
    expect(result).toContain('name: "orders"');
    expect(result).toContain('id: "dp-1"');
    expect(result).toContain('domain: "commerce"');
    expect(result).toContain('schema: {');
  });

  it('emits connector constants with name, type, id, and connection_id fields', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      connectors: [
        {
          key: 'shopify_main',
          data: {
            name: 'Shopify Main',
            type: 'shopify',
            id: 'cn-1',
            connection_id: 'conn-1',
          },
        },
      ],
    };
    const result = emitArtifact(norm);
    expect(result).toContain('export const connectors = {');
    expect(result).toContain('shopify_main: {');
    expect(result).toContain('type: "shopify"');
    expect(result).toContain('id: "cn-1"');
    expect(result).toContain('connection_id: "conn-1"');
  });

  it('emits domain constants with name, id, and data_product_ids fields', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      domains: [
        {
          key: 'commerce',
          data: {
            name: 'commerce',
            id: 'dm-1',
            data_product_ids: ['dp-1', 'dp-2'],
          },
        },
      ],
    };
    const result = emitArtifact(norm);
    expect(result).toContain('export const domains = {');
    expect(result).toContain('commerce: {');
    expect(result).toContain('name: "commerce"');
    expect(result).toContain('id: "dm-1"');
    expect(result).toContain('data_product_ids:');
    expect(result).toContain('"dp-1"');
    expect(result).toContain('"dp-2"');
  });

  it('emits queue constants with name and id fields', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      queues: [
        { key: 'orders_raw', data: { name: 'orders_raw', id: 'q-1' } },
      ],
    };
    const result = emitArtifact(norm);
    expect(result).toContain('export const queues = {');
    expect(result).toContain('orders_raw: {');
    expect(result).toContain('name: "orders_raw"');
    expect(result).toContain('id: "q-1"');
  });

  it('emits flow constants with name and id fields', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      flows: [
        { key: 'ingest_orders', data: { name: 'ingest_orders', id: 'f-1' } },
      ],
    };
    const result = emitArtifact(norm);
    expect(result).toContain('export const flows = {');
    expect(result).toContain('ingest_orders: {');
    expect(result).toContain('name: "ingest_orders"');
    expect(result).toContain('id: "f-1"');
  });

  it('emits workflow constants with name and id fields', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      workflows: [
        { key: 'etl_pipeline', data: { name: 'etl_pipeline', id: 'w-1' } },
      ],
    };
    const result = emitArtifact(norm);
    expect(result).toContain('export const workflows = {');
    expect(result).toContain('etl_pipeline: {');
    expect(result).toContain('name: "etl_pipeline"');
    expect(result).toContain('id: "w-1"');
  });

  it('handles null values correctly (domain, schema, connection_id)', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      dataProducts: [
        {
          key: 'orphan',
          data: { name: 'orphan', id: 'dp-1', domain: null, schema: null },
        },
      ],
      connectors: [
        {
          key: 'no_conn',
          data: { name: 'no_conn', type: 'custom', id: 'cn-1', connection_id: null },
        },
      ],
    };
    const result = emitArtifact(norm);
    expect(result).toContain('domain: null');
    expect(result).toContain('schema: null');
    expect(result).toContain('connection_id: null');
  });

  it('emits multiple resources within a single collection', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      queues: [
        { key: 'alpha', data: { name: 'alpha', id: 'q-1' } },
        { key: 'beta', data: { name: 'beta', id: 'q-2' } },
        { key: 'gamma', data: { name: 'gamma', id: 'q-3' } },
      ],
    };
    const result = emitArtifact(norm);
    expect(result).toContain('alpha: {');
    expect(result).toContain('beta: {');
    expect(result).toContain('gamma: {');
  });

  it('produces byte-identical output for the same input (deterministic)', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      dataProducts: [
        { key: 'orders', data: { name: 'orders', id: 'dp-1', domain: 'sales', schema: null } },
      ],
      queues: [
        { key: 'events', data: { name: 'events', id: 'q-1' } },
      ],
    };
    const result1 = emitArtifact(norm);
    const result2 = emitArtifact(norm);
    expect(result1).toBe(result2);
  });

  it('produces different context hashes for different contexts', () => {
    const norm1: NormalizedContext = {
      ...emptyNorm,
      queues: [{ key: 'a', data: { name: 'a', id: 'q-1' } }],
    };
    const norm2: NormalizedContext = {
      ...emptyNorm,
      queues: [{ key: 'b', data: { name: 'b', id: 'q-2' } }],
    };
    const result1 = emitArtifact(norm1);
    const result2 = emitArtifact(norm2);
    const hash1 = result1.match(/Context hash: ([0-9a-f]+)/)?.[1];
    const hash2 = result2.match(/Context hash: ([0-9a-f]+)/)?.[1];
    expect(hash1).not.toBe(hash2);
  });

  it('uses `as const` on all collection exports', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      dataProducts: [
        { key: 'x', data: { name: 'x', id: 'dp-1', domain: null, schema: null } },
      ],
    };
    const result = emitArtifact(norm);
    expect(result).toContain('} as const;');
    // workspace also has as const
    expect(result).toContain('} as const;');
  });

  it('handles keys that need quoting', () => {
    const norm: NormalizedContext = {
      ...emptyNorm,
      queues: [
        { key: '0invalid', data: { name: '0invalid', id: 'q-1' } },
      ],
    };
    const result = emitArtifact(norm);
    // Keys starting with a digit need quoting
    expect(result).toContain('"0invalid"');
  });
});
