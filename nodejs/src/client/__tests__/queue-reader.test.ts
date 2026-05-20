/**
 * Unit tests for QueueReader and data product error cases.
 * Covers Task 9.4: NotFoundError, AuthorizationError, stream() with bot_id, replay() with options.
 *
 * Requirements: 8.5
 */

import { jest } from '@jest/globals';
import { QueueReader, createQueuesApi } from '../queues';
import { createDataProductsApi } from '../data-products';
import { NotFoundError } from '../../errors/resource';
import { AuthorizationError } from '../../errors/auth';
import { StreamingError } from '../../errors/streaming';
import type { LoxtepHttpClient } from '../../http/client';
import type { RStreamsSdk } from '../../rstreams/leo-runtime';
import type { QueueEvent } from '../queue-types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Minimal mock HTTP client. */
function mockHttp(overrides?: Partial<LoxtepHttpClient>): LoxtepHttpClient {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as unknown as LoxtepHttpClient;
}

/** Mock RStreams SDK that delivers events through offloadEvents. */
function mockRsdkWithEvents(allEvents: QueueEvent[]): RStreamsSdk {
  return {
    offloadEvents: jest.fn(async (opts: Record<string, unknown>) => {
      const limit = (opts.limit as number) ?? allEvents.length;
      const start = opts.start as string | undefined;
      const transform = opts.transform as (
        payload: unknown,
        wrapper: Record<string, unknown>,
        callback: (err?: unknown) => void
      ) => void;

      let startIdx = 0;
      if (start !== undefined) {
        const cursorIdx = allEvents.findIndex((e) => e.event_id === start);
        if (cursorIdx >= 0) {
          startIdx = cursorIdx + 1;
        }
      }

      const batch = allEvents.slice(startIdx, startIdx + limit);
      for (const event of batch) {
        transform(
          event.payload,
          {
            id: event.event_id,
            eid: event.event_id,
            event: event.event_type,
            payload: event.payload,
            correlation_id: event.correlation_id,
          },
          () => { /* no-op */ }
        );
      }
    }),
  } as unknown as RStreamsSdk;
}

/** Mock RStreams SDK whose offloadEvents throws a given error. */
function mockRsdkThatThrows(error: Error): RStreamsSdk {
  return {
    offloadEvents: jest.fn(async () => {
      throw error;
    }),
  } as unknown as RStreamsSdk;
}

/** Collect all events from an async iterable. */
async function collectAll<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterable) {
    result.push(item);
  }
  return result;
}

/** Build a mock data product response for HTTP mocking. */
function mockDataProduct(id: string, queueName?: string) {
  return {
    data_product_id: id,
    organization_id: 'org-1',
    domain_id: 'dom-1',
    name: 'Test Product',
    description: 'Test',
    status: 'active',
    owner: { user_id: 'user-1' },
    storage: queueName ? { rstreams_queue: queueName } : {},
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };
}

/* ------------------------------------------------------------------ */
/*  Tests: QueueReader — open_reader error cases                      */
/* ------------------------------------------------------------------ */

describe('QueueReader — open_reader error cases (Task 9.4)', () => {
  it('throws StreamingError when stream bus config is missing (no rsdk)', async () => {
    const api = createQueuesApi(mockHttp(), { rsdk: undefined });

    await expect(
      api.open_reader({ bot_id: 'bot-1', queue_name: 'test-queue' })
    ).rejects.toThrow(StreamingError);

    await expect(
      api.open_reader({ bot_id: 'bot-1', queue_name: 'test-queue' })
    ).rejects.toThrow(/Stream bus configuration missing/);
  });

  it('throws StreamingError when get_rsdk resolves to undefined', async () => {
    const api = createQueuesApi(mockHttp(), {
      rsdk: undefined,
      get_rsdk: async () => undefined,
    });

    await expect(
      api.open_reader({ bot_id: 'bot-1', queue_name: 'test-queue' })
    ).rejects.toThrow(StreamingError);
  });

  it('returns a QueueReader when rsdk is available', async () => {
    const rsdk = mockRsdkWithEvents([]);
    const api = createQueuesApi(mockHttp(), { rsdk });

    const reader = await api.open_reader({ bot_id: 'bot-1', queue_name: 'test-queue' });

    expect(reader).toBeDefined();
    expect(typeof reader.read).toBe('function');
    expect(typeof reader.close).toBe('function');
  });

  it('resolves rsdk lazily via get_rsdk', async () => {
    const rsdk = mockRsdkWithEvents([]);
    const getRsdk = jest.fn(async () => rsdk);
    const api = createQueuesApi(mockHttp(), { get_rsdk: getRsdk });

    const reader = await api.open_reader({ bot_id: 'bot-1', queue_name: 'test-queue' });

    expect(getRsdk).toHaveBeenCalledTimes(1);
    expect(reader).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: QueueReader — read behavior                                */
/* ------------------------------------------------------------------ */

describe('QueueReader — read behavior', () => {
  it('read() yields events from the queue', async () => {
    const events: QueueEvent[] = [
      { event_id: 'e1', payload: { x: 1 } },
      { event_id: 'e2', payload: { x: 2 } },
      { event_id: 'e3', payload: { x: 3 } },
    ];
    const rsdk = mockRsdkWithEvents(events);
    const reader = new QueueReader(rsdk, 'bot-1', 'test-queue');

    const collected = await collectAll(reader.read());

    expect(collected).toHaveLength(3);
    expect(collected[0].event_id).toBe('e1');
    expect(collected[1].event_id).toBe('e2');
    expect(collected[2].event_id).toBe('e3');
  });

  it('read() after close() yields no events', async () => {
    const events: QueueEvent[] = [
      { event_id: 'e1', payload: { x: 1 } },
    ];
    const rsdk = mockRsdkWithEvents(events);
    const reader = new QueueReader(rsdk, 'bot-1', 'test-queue');

    reader.close();
    const collected = await collectAll(reader.read());

    expect(collected).toHaveLength(0);
  });

  it('close() is idempotent', async () => {
    const rsdk = mockRsdkWithEvents([]);
    const reader = new QueueReader(rsdk, 'bot-1', 'test-queue');

    reader.close();
    reader.close(); // second call — no-op

    const collected = await collectAll(reader.read());
    expect(collected).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: data_products.stream() — error mapping                     */
/* ------------------------------------------------------------------ */

describe('data_products.stream() — error cases (Task 9.4)', () => {
  it('throws NotFoundError when data product does not exist (404)', async () => {
    const http = mockHttp({
      get: jest.fn().mockRejectedValue(
        Object.assign(new Error('Not found'), { status_code: 404 })
      ),
    });
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
      rsdk: mockRsdkWithEvents([]),
    });

    await expect(collectAll(api.stream('nonexistent-dp', { bot_id: 'bot-1' }))).rejects.toThrow(
      NotFoundError
    );
    await expect(collectAll(api.stream('nonexistent-dp', { bot_id: 'bot-1' }))).rejects.toThrow(
      /not found/i
    );
  });

  it('throws NotFoundError when queue does not exist (stream bus error)', async () => {
    const dp = mockDataProduct('dp-1', 'nonexistent-queue');
    const http = mockHttp({
      get: jest.fn().mockResolvedValue({ success: true, data: dp }),
    });
    const rsdk = mockRsdkThatThrows(new Error('Queue does not exist'));
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
      rsdk,
    });

    await expect(collectAll(api.stream('dp-1', { bot_id: 'bot-1' }))).rejects.toThrow(
      NotFoundError
    );
    await expect(collectAll(api.stream('dp-1', { bot_id: 'bot-1' }))).rejects.toThrow(
      /not found/i
    );
  });

  it('throws AuthorizationError when bot lacks read permissions', async () => {
    const dp = mockDataProduct('dp-1', 'protected-queue');
    const http = mockHttp({
      get: jest.fn().mockResolvedValue({ success: true, data: dp }),
    });
    const rsdk = mockRsdkThatThrows(new Error('Access denied for bot'));
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
      rsdk,
    });

    await expect(collectAll(api.stream('dp-1', { bot_id: 'bot-1' }))).rejects.toThrow(
      AuthorizationError
    );
    await expect(collectAll(api.stream('dp-1', { bot_id: 'bot-1' }))).rejects.toThrow(
      /does not have read permission/i
    );
  });

  it('throws StreamingError when data product has no stream queue', async () => {
    const dp = mockDataProduct('dp-1'); // no queue_name
    const http = mockHttp({
      get: jest.fn().mockResolvedValue({ success: true, data: dp }),
    });
    const rsdk = mockRsdkWithEvents([]);
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
      rsdk,
    });

    await expect(collectAll(api.stream('dp-1', { bot_id: 'bot-1' }))).rejects.toThrow(
      StreamingError
    );
    await expect(collectAll(api.stream('dp-1', { bot_id: 'bot-1' }))).rejects.toThrow(
      /no stream queue/i
    );
  });

  it('throws StreamingError when bot_id is missing with stream bus configured', async () => {
    const dp = mockDataProduct('dp-1', 'test-queue');
    const http = mockHttp({
      get: jest.fn().mockResolvedValue({ success: true, data: dp }),
    });
    const rsdk = mockRsdkWithEvents([]);
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
      rsdk,
    });

    // stream() without bot_id when rsdk is configured should throw StreamingError
    await expect(collectAll(api.stream('dp-1'))).rejects.toThrow(StreamingError);
    await expect(collectAll(api.stream('dp-1'))).rejects.toThrow(/bot_id is required/i);
  });

  it('stream() with valid bot_id yields events from the queue', async () => {
    const dp = mockDataProduct('dp-1', 'test-queue');
    const events: QueueEvent[] = [
      { event_id: 'e1', payload: { action: 'click' } },
      { event_id: 'e2', payload: { action: 'view' } },
    ];
    const http = mockHttp({
      get: jest.fn().mockResolvedValue({ success: true, data: dp }),
    });
    const rsdk = mockRsdkWithEvents(events);
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
      rsdk,
    });

    const collected = await collectAll(api.stream('dp-1', { bot_id: 'bot-1' }));

    expect(collected).toHaveLength(2);
    expect(collected[0].event_id).toBe('e1');
    expect(collected[1].event_id).toBe('e2');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: data_products.replay() — error and success cases           */
/* ------------------------------------------------------------------ */

describe('data_products.replay() — error and success cases (Task 9.4)', () => {
  it('throws NotFoundError when data product does not exist (404)', async () => {
    const http = mockHttp({
      get: jest.fn().mockRejectedValue(
        Object.assign(new Error('Not found'), { status_code: 404 })
      ),
    });
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
    });

    await expect(collectAll(api.replay('nonexistent-dp'))).rejects.toThrow(NotFoundError);
    await expect(collectAll(api.replay('nonexistent-dp'))).rejects.toThrow(/not found/i);
  });

  it('throws StreamingError when data product has no stream queue', async () => {
    const dp = mockDataProduct('dp-1'); // no queue_name
    const http = mockHttp({
      get: jest.fn().mockResolvedValue({ success: true, data: dp }),
    });
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
    });

    await expect(collectAll(api.replay('dp-1'))).rejects.toThrow(StreamingError);
    await expect(collectAll(api.replay('dp-1'))).rejects.toThrow(/no stream queue/i);
  });

  it('replay() with valid options yields events via HTTP API', async () => {
    const dp = mockDataProduct('dp-1', 'test-queue');
    const replayEvents = [
      { event_id: 'r1', payload: { type: 'historical' }, timestamp: '2025-01-01T00:00:00Z' },
      { event_id: 'r2', payload: { type: 'historical' }, timestamp: '2025-01-01T01:00:00Z' },
    ];
    const http = mockHttp({
      get: jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/dataproducts/')) {
          return { success: true, data: dp };
        }
        if (url.includes('/observe/trace/')) {
          return { events: replayEvents };
        }
        return {};
      }),
    });
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
    });

    const collected = await collectAll(
      api.replay('dp-1', { from_beginning: true, limit: 100 })
    );

    expect(collected).toHaveLength(2);
    expect(collected[0].event_id).toBe('r1');
    expect(collected[1].event_id).toBe('r2');
  });

  it('replay() with from_eid and to_eid passes correct query params', async () => {
    const dp = mockDataProduct('dp-1', 'test-queue');
    const getMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/dataproducts/')) {
        return { success: true, data: dp };
      }
      if (url.includes('/observe/trace/')) {
        // Verify query params are passed
        expect(url).toContain('start=eid-100');
        expect(url).toContain('end=eid-200');
        expect(url).toContain('limit=50');
        return { events: [] };
      }
      return {};
    });
    const http = mockHttp({ get: getMock });
    const api = createDataProductsApi(http, {
      get_queue_metadata: jest.fn(),
      get_reader_checkpoint: jest.fn(),
    });

    const collected = await collectAll(
      api.replay('dp-1', { from_eid: 'eid-100', to_eid: 'eid-200', limit: 50 })
    );

    expect(collected).toHaveLength(0);
    // GET called twice: once for data product, once for replay events
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});
