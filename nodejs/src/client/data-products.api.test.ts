/**
 * Unit tests for data_products HTTP surface (get/list/search/query/etc.).
 * Writer/reader/stream paths are covered in dedicated suites.
 */

import { createDataProductsApi } from './data-products.js';
import type { LoxtepHttpClient } from '../http/client.js';
import type { DataProduct } from './data-products-types.js';

const DP: DataProduct = {
  data_product_id: 'dp-1',
  name: 'orders',
  organization_id: 'org-1',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  storage: { rstreams_queue: 'q-orders' },
  metadata: {
    business_glossary: { order: { definition: 'A purchase' } },
    field_glossary_map: { order_id: 'order' },
  },
} as DataProduct;

function mockHttp(handlers: {
  get?: (path: string) => unknown;
  post?: (path: string, body: unknown) => unknown;
}): LoxtepHttpClient {
  return {
    get: jest.fn(async (path: string) => {
      if (!handlers.get) throw new Error(`unexpected GET ${path}`);
      return handlers.get(path);
    }),
    post: jest.fn(async (path: string, body: unknown) => {
      if (!handlers.post) throw new Error(`unexpected POST ${path}`);
      return handlers.post(path, body);
    }),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  } as unknown as LoxtepHttpClient;
}

describe('createDataProductsApi HTTP methods', () => {
  it('get builds include_* query string', async () => {
    const http = mockHttp({
      get: path => {
        expect(path).toContain('/dataproducts/dp-1?');
        expect(path).toContain('include_schema=true');
        expect(path).toContain('include_quality=true');
        return { success: true, data: DP };
      },
    });
    const api = createDataProductsApi(http);
    await expect(
      api.get('dp-1', { include_schema: true, include_quality: true })
    ).resolves.toEqual(DP);
  });

  it('get_lexicon prefers glossary_terms then metadata', async () => {
    const http = mockHttp({
      get: () => ({
        success: true,
        data: {
          ...DP,
          glossary_terms: { sku: { definition: 'Stock keeping unit' } },
        },
      }),
    });
    const api = createDataProductsApi(http);
    const lexicon = await api.get_lexicon('dp-1');
    expect(lexicon.glossary_terms).toEqual({ sku: { definition: 'Stock keeping unit' } });
    expect(lexicon.field_glossary_map).toEqual({ order_id: 'order' });
  });

  it('get_lexicon falls back to metadata.business_glossary', async () => {
    const http = mockHttp({ get: () => ({ success: true, data: DP }) });
    const api = createDataProductsApi(http);
    const lexicon = await api.get_lexicon('dp-1');
    expect(lexicon.glossary_terms).toEqual({ order: { definition: 'A purchase' } });
  });

  it('list applies filters including tags join', async () => {
    const http = mockHttp({
      get: path => {
        expect(path.startsWith('/dataproducts?')).toBe(true);
        expect(path).toContain('domain_id=dom-1');
        expect(path).toContain('status=active');
        expect(path).toContain('tags=a%2Cb');
        return {
          success: true,
          data: { items: [DP], pagination: { page: 1, page_size: 10, total: 1 } },
        };
      },
    });
    const api = createDataProductsApi(http);
    const result = await api.list({
      domain_id: 'dom-1',
      status: 'active',
      tags: ['a', 'b'],
      search: 'orders',
    });
    expect(result.items).toHaveLength(1);
  });

  it('search GETs /search with defaults', async () => {
    const http = mockHttp({
      get: path => {
        expect(path).toContain('/search?');
        expect(path).toContain('q=orders');
        expect(path).toContain('type=data_product');
        return { success: true, data: { results: [] } };
      },
    });
    const api = createDataProductsApi(http);
    await api.search('orders');
  });

  it('query maps warehouse execute success body', async () => {
    const http = mockHttp({
      post: (path, body) => {
        expect(path).toBe('/dataproducts/warehouse/execute');
        expect(body).toEqual({ sql: 'SELECT 1', data_product_ids_hint: ['dp-1'] });
        return {
          success: true,
          data: {
            status: 'ok',
            rows: [{ n: 1 }],
            row_count: 1,
            total_count: 1,
            execution_time_ms: 12,
          },
        };
      },
    });
    const api = createDataProductsApi(http);
    const result = await api.query('dp-1', 'SELECT 1');
    expect(result.items).toEqual([{ n: 1 }]);
    expect(result.metadata.query_time_ms).toBe(12);
  });

  it('query throws when warehouse status is failed', async () => {
    const http = mockHttp({
      post: () => ({
        data: { status: 'failed', error: 'syntax error' },
      }),
    });
    const api = createDataProductsApi(http);
    await expect(api.query('dp-1', 'BAD')).rejects.toThrow(/syntax error/);
  });

  it('list_tables filters to data product id', async () => {
    const http = mockHttp({
      get: path => {
        expect(path).toBe('/dataproducts/warehouse/tables');
        return {
          data: {
            tables: [
              { name: 'orders', sql_name: 'bronze.orders', data_product_id: 'dp-1', medallion: 'bronze' },
              { name: 'other', data_product_id: 'dp-2' },
              { name: 'shared' },
            ],
          },
        };
      },
    });
    const api = createDataProductsApi(http);
    const result = await api.list_tables('dp-1');
    expect(result.items.map(i => i.name)).toEqual(['orders', 'shared']);
    expect(result.items[0]?.schema).toBe('bronze');
  });

  it('get_queue_info requires deps and returns empty when no queue', async () => {
    const apiNoDeps = createDataProductsApi(mockHttp({ get: () => ({ success: true, data: DP }) }));
    await expect(apiNoDeps.get_queue_info('dp-1')).rejects.toThrow(/requires queues API/);

    const get_queue_metadata = jest.fn(async () => ({
      queue_name: 'q-orders',
      checkpoints: [],
      readers: [],
      writers: [],
      stats: {},
    }));
    const http = mockHttp({
      get: () => ({
        success: true,
        data: { ...DP, storage: {} },
      }),
    });
    const api = createDataProductsApi(http, { get_queue_metadata, get_reader_checkpoint: jest.fn() });
    const empty = await api.get_queue_info('dp-1');
    expect(empty.queue_name).toBe('');
    expect(get_queue_metadata).not.toHaveBeenCalled();
  });

  it('get_queue_info delegates to queues when rstreams_queue set', async () => {
    const get_queue_metadata = jest.fn(async () => ({
      queue_name: 'q-orders',
      checkpoints: [],
      readers: [],
      writers: [],
      stats: { depth: 3 },
    }));
    const http = mockHttp({ get: () => ({ success: true, data: DP }) });
    const api = createDataProductsApi(http, {
      get_queue_metadata,
      get_reader_checkpoint: jest.fn(),
    });
    const meta = await api.get_queue_info('dp-1');
    expect(get_queue_metadata).toHaveBeenCalledWith('q-orders');
    expect(meta.stats).toEqual({ depth: 3 });
  });

  it('get_reader_checkpoint throws without queue and delegates with queue', async () => {
    const get_reader_checkpoint = jest.fn(async () => ({
      queue_name: 'q-orders',
      bot_id: 'bot-1',
      checkpoint: 'eid-1',
    }));
    const apiNoDeps = createDataProductsApi(mockHttp({ get: () => ({ success: true, data: DP }) }));
    await expect(apiNoDeps.get_reader_checkpoint('dp-1', 'bot')).rejects.toThrow(/requires queues API/);

    const httpNoQ = mockHttp({
      get: () => ({ success: true, data: { ...DP, storage: {} } }),
    });
    const apiNoQ = createDataProductsApi(httpNoQ, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint,
    });
    await expect(apiNoQ.get_reader_checkpoint('dp-1', 'bot')).rejects.toThrow(/no stream queue/);

    const http = mockHttp({ get: () => ({ success: true, data: DP }) });
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint,
    });
    await api.get_reader_checkpoint('dp-1', 'bot-1');
    expect(get_reader_checkpoint).toHaveBeenCalledWith('q-orders', 'bot-1');
  });

  it('create posts body and requires data', async () => {
    const http = mockHttp({
      post: (path, body) => {
        expect(path).toBe('/dataproducts');
        expect(body).toMatchObject({ name: 'orders' });
        return { success: true, data: DP };
      },
    });
    const api = createDataProductsApi(http);
    await expect(api.create({ name: 'orders' } as never)).resolves.toEqual(DP);

    const bad = mockHttp({ post: () => ({ success: true }) });
    await expect(
      createDataProductsApi(bad).create({ name: 'x' } as never)
    ).rejects.toThrow(/Invalid create/);
  });

  it('get_usage_map unwraps envelope or top-level nodes', async () => {
    const http = mockHttp({
      get: () => ({
        data: {
          nodes: [{ id: 'a', kind: 'source', name: 'A', fanout: 1 }],
          edges: [{ source: 'a', target: 'b', projection_spec_id: 'p1' }],
        },
      }),
    });
    const api = createDataProductsApi(http);
    const map = await api.get_usage_map();
    expect(map.nodes).toHaveLength(1);
    expect(map.edges).toHaveLength(1);

    const flat = mockHttp({
      get: () => ({ nodes: [], edges: [] }),
    });
    await expect(createDataProductsApi(flat).get_usage_map()).resolves.toEqual({
      nodes: [],
      edges: [],
    });
  });

  it('readiness and promote hit graph promotion routes', async () => {
    const http = mockHttp({
      get: path => {
        expect(path).toBe('/graph/promotions/dp-1/readiness');
        return {
          success: true,
          data: { promotable: true, progress_pct: 100, prerequisites: [] },
        };
      },
      post: (path, body) => {
        expect(path).toBe('/graph/promotions/dp-1/promote');
        expect(body).toEqual({ target_tier: 'silver' });
        return {
          success: true,
          data: { data_product_id: 'dp-1', target_tier: 'silver', status: 'promoted' },
        };
      },
    });
    const api = createDataProductsApi(http);
    await expect(api.readiness('dp-1')).resolves.toMatchObject({ promotable: true });
    await expect(api.promote('dp-1', 'silver')).resolves.toMatchObject({ status: 'promoted' });
  });

  it('invalidate_cache is a no-op without resolver and forwards with resolver', () => {
    const api = createDataProductsApi(mockHttp({}));
    expect(() => api.invalidate_cache()).not.toThrow();

    const invalidate = jest.fn();
    const withResolver = createDataProductsApi(mockHttp({}), {
      resolver: { invalidate } as never,
    });
    withResolver.invalidate_cache('dp-1');
    expect(invalidate).toHaveBeenCalledWith('dp-1');
  });

  it('stream() yields events via HTTP observe when stream bus is unset', async () => {
    const events = [
      { event_id: 'e1', payload: { a: 1 } },
      { event_id: 'e2', payload: { a: 2 } },
    ];
    let calls = 0;
    const http = mockHttp({
      get: path => {
        if (path.startsWith('/dataproducts/')) {
          return { success: true, data: DP };
        }
        calls += 1;
        expect(path).toContain('/observe/trace/q-orders/events');
        if (calls === 1) {
          return { events };
        }
        return { events: [] };
      },
    });
    const api = createDataProductsApi(http);
    const collected: unknown[] = [];
    for await (const ev of api.stream('dp-1', { batch_size: 10 })) {
      collected.push(ev);
    }
    expect(collected).toEqual(events);
  });

  it('stream() wraps 404 as NotFoundError', async () => {
    const http = mockHttp({
      get: () => {
        throw Object.assign(new Error('missing'), { status_code: 404 });
      },
    });
    const api = createDataProductsApi(http);
    await expect(async () => {
      for await (const _ of api.stream('missing')) {
        /* drain */
      }
    }).rejects.toThrow(/not found/i);
  });

  it('stream() requires bot_id when rsdk is configured', async () => {
    const http = mockHttp({ get: () => ({ success: true, data: DP }) });
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
      rsdk: {} as never,
    });
    await expect(async () => {
      for await (const _ of api.stream('dp-1')) {
        /* drain */
      }
    }).rejects.toThrow(/bot_id is required/);
  });
});
