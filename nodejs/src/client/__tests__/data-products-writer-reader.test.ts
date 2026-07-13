/**
 * Unit tests for data_products.get_writer() and data_products.get_reader().
 *
 * Validates: Requirements 1.4, 1.5, 1.6, 2.3, 2.4, 2.5, 2.6, 11.1, 11.2, 11.3, 11.4
 */

import { jest } from '@jest/globals';
import { createDataProductsApi } from '../data-products';
import { StreamingError } from '../../errors/streaming';
import { NotFoundError } from '../../errors/resource';
import type { LoxtepHttpClient } from '../../http/client';
import type { DataProductResolver, FullResolution } from '../data-product-resolver';

/* ------------------------------------------------------------------ */
/*  Mock: RStreams modules                                            */
/* ------------------------------------------------------------------ */

// Track putPayloadsToQueue calls
const putPayloadsToQueueMock = jest.fn<
  (rsdk: unknown, botId: string, queueName: string, payloads: unknown[]) => Promise<void>
>();

// Track readQueueBatch calls
const readQueueBatchMock = jest.fn<
  (rsdk: unknown, id: string, inQueue: string, limit: number, start?: string | null) => Promise<{ events: unknown[]; next_start: string | undefined }>
>();

// Track createRStreamsSdk calls
const createRStreamsSdkMock = jest.fn<(config: unknown) => unknown>();

// Track resolveStreamsConfiguration calls
const resolveStreamsConfigurationMock = jest.fn<(partial?: unknown) => unknown>();

// Track createQueueWriter calls
const createQueueWriterMock = jest.fn<
  (
    rsdk: unknown,
    botId: string,
    queueName: string,
    closedError: () => Error
  ) => { write: (event: unknown) => void; close: () => Promise<void> }
>();

jest.mock('../../rstreams/event-bridge', () => ({
  putPayloadsToQueue: (...args: unknown[]) => putPayloadsToQueueMock(...args as [unknown, string, string, unknown[]]),
  readQueueBatch: (...args: unknown[]) => readQueueBatchMock(...args as [unknown, string, string, number, string | null | undefined]),
  createQueueWriter: (...args: unknown[]) =>
    createQueueWriterMock(...args as [unknown, string, string, () => Error]),
}));

jest.mock('../../rstreams/leo-runtime', () => ({
  createRStreamsSdk: (...args: unknown[]) => createRStreamsSdkMock(...args as [unknown]),
}));

jest.mock('../../rstreams/configuration', () => ({
  resolveStreamsConfiguration: (...args: unknown[]) => resolveStreamsConfigurationMock(...args as [unknown]),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Minimal mock HTTP client. */
function mockHttp(): LoxtepHttpClient {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  } as unknown as LoxtepHttpClient;
}

/** Standard stream config fixture. */
const STREAM_CONFIG = {
  Region: 'us-east-1',
  LeoEvent: 'org-BusLeoEvent-123',
  LeoStream: 'org-BusLeoStream-456',
  LeoCron: 'org-BusLeoCron-789',
  LeoS3: 'org-busleos3-abc',
  LeoKinesisStream: 'org-Buskinesis-def',
  LeoFirehoseStream: 'org-fh',
  LeoSettings: 'org-BusLeoSettings-ghi',
};

/** Standard resolved data product fixture. */
const RESOLVED_DATA_PRODUCT: FullResolution = {
  dataProduct: {
    data_product_id: '09fa202b-1234-5678-9abc-def012345678',
    name: 'shopify_gql_customer',
    queue_name: '9c5a188a-queue-conn-out',
    bot_id: 'wkflow-nodes-connector-abc',
    instance_id: '9c5a188a-aaaa-bbbb-cccc-dddddddddddd',
    workflow_id: 'wf-1',
    deployment_id: 'dep-1',
  },
  streamConfig: STREAM_CONFIG,
};

/** Creates a mock DataProductResolver. */
function mockResolver(
  resolveImpl?: (idOrName: string) => Promise<FullResolution>
): DataProductResolver {
  const defaultResolve = async () => RESOLVED_DATA_PRODUCT;
  return {
    resolve: jest.fn(resolveImpl ?? defaultResolve),
    invalidate: jest.fn(),
  } as unknown as DataProductResolver;
}

/** Fake RStreams SDK instance returned by createRStreamsSdk. */
const FAKE_RSDK = { __fake: 'rsdk' };

/* ------------------------------------------------------------------ */
/*  Setup / Teardown                                                  */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  jest.clearAllMocks();
  // Default: resolveStreamsConfiguration returns the config as-is
  resolveStreamsConfigurationMock.mockImplementation((partial) => partial);
  // Default: createRStreamsSdk returns a fake SDK instance
  createRStreamsSdkMock.mockReturnValue(FAKE_RSDK);
  // Default: putPayloadsToQueue succeeds
  putPayloadsToQueueMock.mockResolvedValue(undefined);
  // Default: createQueueWriter buffers events and flushes on close
  createQueueWriterMock.mockImplementation((rsdk, botId, queueName) => {
    const buffer: unknown[] = [];
    return {
      write(event: unknown) {
        buffer.push(event);
      },
      async close() {
        if (buffer.length > 0) {
          await putPayloadsToQueueMock(rsdk, botId, queueName, buffer);
        }
      },
    };
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: get_writer — basic resolution and FlowWriter (Req 1.4, 1.5)*/
/* ------------------------------------------------------------------ */

describe('data_products.get_writer — resolution and FlowWriter', () => {
  it('resolves data product and returns FlowWriter with correct bot_id and queue', async () => {
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const writer = await api.get_writer('shopify_gql_customer');

    expect(resolver.resolve).toHaveBeenCalledWith('shopify_gql_customer');
    expect(resolveStreamsConfigurationMock).toHaveBeenCalledWith(STREAM_CONFIG);
    expect(createRStreamsSdkMock).toHaveBeenCalledWith(STREAM_CONFIG);

    // Writer should have write and close methods
    expect(typeof writer.write).toBe('function');
    expect(typeof writer.close).toBe('function');
  });

  it('FlowWriter.write() buffers events and close() flushes via putPayloadsToQueue', async () => {
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const writer = await api.get_writer('shopify_gql_customer');

    writer.write({ id: 1, name: 'Alice' });
    writer.write({ id: 2, name: 'Bob' });
    await writer.close();

    expect(putPayloadsToQueueMock).toHaveBeenCalledWith(
      FAKE_RSDK,
      'wkflow-nodes-connector-abc',
      '9c5a188a-queue-conn-out',
      [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
    );
  });

  it('FlowWriter uses deployment-resolved bot_id by default (Req 11.3)', async () => {
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const writer = await api.get_writer('shopify_gql_customer');
    writer.write({ event: 'test' });
    await writer.close();

    // bot_id should be from the resolved data product
    expect(putPayloadsToQueueMock).toHaveBeenCalledWith(
      FAKE_RSDK,
      'wkflow-nodes-connector-abc',
      '9c5a188a-queue-conn-out',
      expect.any(Array)
    );
  });

  it('close() with empty buffer does not call putPayloadsToQueue', async () => {
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const writer = await api.get_writer('shopify_gql_customer');
    await writer.close();

    expect(putPayloadsToQueueMock).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: get_writer — custom bot_id override (Req 11.1, 11.4)       */
/* ------------------------------------------------------------------ */

describe('data_products.get_writer — custom bot_id override', () => {
  it('uses custom bot_id from options instead of deployment-resolved bot_id', async () => {
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const writer = await api.get_writer('shopify_gql_customer', {
      bot_id: 'my-custom-bot',
    });
    writer.write({ event: 'test' });
    await writer.close();

    expect(putPayloadsToQueueMock).toHaveBeenCalledWith(
      FAKE_RSDK,
      'my-custom-bot',
      '9c5a188a-queue-conn-out',
      expect.any(Array)
    );
  });

  it('flushes all events in a single close() call (batching handled by stream runtime)', async () => {
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const writer = await api.get_writer('shopify_gql_customer', { batch_size: 2 });
    writer.write({ id: 1 });
    writer.write({ id: 2 });
    writer.write({ id: 3 });
    await writer.close();

    expect(putPayloadsToQueueMock).toHaveBeenCalledTimes(1);
    expect(putPayloadsToQueueMock).toHaveBeenCalledWith(
      FAKE_RSDK,
      'wkflow-nodes-connector-abc',
      '9c5a188a-queue-conn-out',
      [{ id: 1 }, { id: 2 }, { id: 3 }]
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: get_reader — basic resolution (Req 2.3, 2.4)              */
/* ------------------------------------------------------------------ */

describe('data_products.get_reader — resolution and AsyncIterable', () => {
  it('resolves data product and returns AsyncIterable', async () => {
    readQueueBatchMock.mockResolvedValue({ events: [], next_start: undefined });
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const reader = await api.get_reader('shopify_gql_customer');

    expect(resolver.resolve).toHaveBeenCalledWith('shopify_gql_customer');
    expect(resolveStreamsConfigurationMock).toHaveBeenCalledWith(STREAM_CONFIG);
    expect(createRStreamsSdkMock).toHaveBeenCalledWith(STREAM_CONFIG);

    // Reader should be an async iterable
    expect(reader[Symbol.asyncIterator]).toBeDefined();
  });

  it('reader yields events from readQueueBatch', async () => {
    readQueueBatchMock.mockResolvedValueOnce({
      events: [
        { event_id: 'e1', payload: { name: 'Alice' } },
        { event_id: 'e2', payload: { name: 'Bob' } },
      ],
      next_start: undefined,
    });

    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const reader = await api.get_reader('shopify_gql_customer');
    const events: unknown[] = [];
    for await (const event of reader) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event_id: 'e1', payload: { name: 'Alice' } });
    expect(events[1]).toEqual({ event_id: 'e2', payload: { name: 'Bob' } });
  });

  it('reader paginates through multiple batches', async () => {
    readQueueBatchMock
      .mockResolvedValueOnce({
        events: Array.from({ length: 100 }, (_, i) => ({ event_id: `e${i}`, payload: { i } })),
        next_start: 'cursor-100',
      })
      .mockResolvedValueOnce({
        events: [{ event_id: 'e100', payload: { i: 100 } }],
        next_start: undefined,
      });

    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const reader = await api.get_reader('shopify_gql_customer');
    const events: unknown[] = [];
    for await (const event of reader) {
      events.push(event);
    }

    expect(events).toHaveLength(101);
    expect(readQueueBatchMock).toHaveBeenCalledTimes(2);
    // Second call should use the cursor from first batch
    expect(readQueueBatchMock).toHaveBeenNthCalledWith(
      2, FAKE_RSDK, expect.any(String), '9c5a188a-queue-conn-out', 100, 'cursor-100'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: get_reader — default bot_id (Req 2.5)                     */
/* ------------------------------------------------------------------ */

describe('data_products.get_reader — default bot_id generation', () => {
  it('uses default bot_id of `sdk-reader-{dp_name}` when no bot_id provided', async () => {
    readQueueBatchMock.mockResolvedValue({ events: [], next_start: undefined });
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const reader = await api.get_reader('shopify_gql_customer');
    // Consume the iterable to trigger readQueueBatch
    for await (const _ of reader) { /* drain */ }

    expect(readQueueBatchMock).toHaveBeenCalledWith(
      FAKE_RSDK,
      'sdk-reader-shopify_gql_customer',
      '9c5a188a-queue-conn-out',
      100,
      null
    );
  });

  it('uses data product name (not id) for default bot_id', async () => {
    readQueueBatchMock.mockResolvedValue({ events: [], next_start: undefined });
    const customResolution: FullResolution = {
      ...RESOLVED_DATA_PRODUCT,
      dataProduct: {
        ...RESOLVED_DATA_PRODUCT.dataProduct,
        name: 'my_custom_product',
      },
    };
    const resolver = mockResolver(async () => customResolution);
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const reader = await api.get_reader('my_custom_product');
    for await (const _ of reader) { /* drain */ }

    expect(readQueueBatchMock).toHaveBeenCalledWith(
      FAKE_RSDK,
      'sdk-reader-my_custom_product',
      expect.any(String),
      100,
      null
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: get_reader — custom bot_id override (Req 2.4, 11.2, 11.4) */
/* ------------------------------------------------------------------ */

describe('data_products.get_reader — custom bot_id override', () => {
  it('uses custom bot_id from options instead of default', async () => {
    readQueueBatchMock.mockResolvedValue({ events: [], next_start: undefined });
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const reader = await api.get_reader('shopify_gql_customer', {
      bot_id: 'my-reader-bot',
    });
    for await (const _ of reader) { /* drain */ }

    expect(readQueueBatchMock).toHaveBeenCalledWith(
      FAKE_RSDK,
      'my-reader-bot',
      '9c5a188a-queue-conn-out',
      100,
      null
    );
  });

  it('supports from option for start position (Req 11.2)', async () => {
    readQueueBatchMock.mockResolvedValue({ events: [], next_start: undefined });
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const reader = await api.get_reader('shopify_gql_customer', {
      from: 'z/2024/01/01/00:00:00',
    });
    for await (const _ of reader) { /* drain */ }

    expect(readQueueBatchMock).toHaveBeenCalledWith(
      FAKE_RSDK,
      'sdk-reader-shopify_gql_customer',
      '9c5a188a-queue-conn-out',
      100,
      'z/2024/01/01/00:00:00'
    );
  });

  it('supports batch_size option (Req 11.2)', async () => {
    readQueueBatchMock.mockResolvedValue({ events: [], next_start: undefined });
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    const reader = await api.get_reader('shopify_gql_customer', {
      batch_size: 50,
    });
    for await (const _ of reader) { /* drain */ }

    expect(readQueueBatchMock).toHaveBeenCalledWith(
      FAKE_RSDK,
      'sdk-reader-shopify_gql_customer',
      '9c5a188a-queue-conn-out',
      50,
      null
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Error propagation from resolver (Req 1.6, 10.1, 10.2)     */
/* ------------------------------------------------------------------ */

describe('data_products.get_writer — error propagation from resolver', () => {
  it('propagates StreamingError when data product is not deployed', async () => {
    const resolver = mockResolver(async () => {
      throw new StreamingError(
        "Data product 'shopify_gql_customer' (09fa202b-...) is not deployed. Deploy the workflow first.",
        { details: { data_product_id: '09fa202b-...', hint: 'Use deploy_workflow' } }
      );
    });
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    await expect(api.get_writer('shopify_gql_customer')).rejects.toThrow(StreamingError);
    await expect(api.get_writer('shopify_gql_customer')).rejects.toThrow(/not deployed/);
  });

  it('propagates NotFoundError when data product is not found', async () => {
    const resolver = mockResolver(async () => {
      throw new NotFoundError(
        "Data product 'nonexistent' not found.",
        'data_product',
        'nonexistent',
        { details: { hint: 'Check the data product name' } }
      );
    });
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    await expect(api.get_writer('nonexistent')).rejects.toThrow(NotFoundError);
    await expect(api.get_writer('nonexistent')).rejects.toThrow(/not found/);
  });

  it('throws StreamingError when resolver is not configured', async () => {
    const api = createDataProductsApi(mockHttp(), {} as any);

    await expect(api.get_writer('shopify_gql_customer')).rejects.toThrow(StreamingError);
    await expect(api.get_writer('shopify_gql_customer')).rejects.toThrow(/DataProductResolver/);
  });
});

describe('data_products.get_reader — error propagation from resolver', () => {
  it('propagates StreamingError when data product is not deployed', async () => {
    const resolver = mockResolver(async () => {
      throw new StreamingError(
        "Data product 'shopify_gql_customer' is not deployed. Deploy the workflow first.",
        { details: { data_product_id: '09fa202b-...', hint: 'Use deploy_workflow' } }
      );
    });
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    await expect(api.get_reader('shopify_gql_customer')).rejects.toThrow(StreamingError);
    await expect(api.get_reader('shopify_gql_customer')).rejects.toThrow(/not deployed/);
  });

  it('propagates NotFoundError when data product is not found', async () => {
    const resolver = mockResolver(async () => {
      throw new NotFoundError(
        "Data product 'nonexistent' not found.",
        'data_product',
        'nonexistent',
        { details: { hint: 'Check the data product name' } }
      );
    });
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    await expect(api.get_reader('nonexistent')).rejects.toThrow(NotFoundError);
    await expect(api.get_reader('nonexistent')).rejects.toThrow(/not found/);
  });

  it('throws StreamingError when resolver is not configured', async () => {
    const api = createDataProductsApi(mockHttp(), {} as any);

    await expect(api.get_reader('shopify_gql_customer')).rejects.toThrow(StreamingError);
    await expect(api.get_reader('shopify_gql_customer')).rejects.toThrow(/DataProductResolver/);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: get_writer — StreamingError on incomplete stream config     */
/* ------------------------------------------------------------------ */

describe('data_products.get_writer — stream config resolution failure', () => {
  it('throws StreamingError when resolveStreamsConfiguration returns undefined', async () => {
    resolveStreamsConfigurationMock.mockReturnValue(undefined);
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    await expect(api.get_writer('shopify_gql_customer')).rejects.toThrow(StreamingError);
    await expect(api.get_writer('shopify_gql_customer')).rejects.toThrow(/stream bus configuration/);
  });
});

describe('data_products.get_reader — stream config resolution failure', () => {
  it('throws StreamingError when resolveStreamsConfiguration returns undefined', async () => {
    resolveStreamsConfigurationMock.mockReturnValue(undefined);
    const resolver = mockResolver();
    const api = createDataProductsApi(mockHttp(), { resolver } as any);

    await expect(api.get_reader('shopify_gql_customer')).rejects.toThrow(StreamingError);
    await expect(api.get_reader('shopify_gql_customer')).rejects.toThrow(/stream bus configuration/);
  });
});
