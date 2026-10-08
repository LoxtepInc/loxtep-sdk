import { createHttpQueueWriter } from './http-queue-writer.js';
import type { LoxtepHttpClient } from '../http/client.js';
import { StreamingError } from '../errors/streaming.js';

describe('createHttpQueueWriter', () => {
  it('buffers writes and POSTs envelopes on close with instance header', async () => {
    const posts: Array<{ path: string; body: unknown; options?: unknown }> = [];
    const http = {
      post: async (path: string, body?: unknown, options?: unknown) => {
        posts.push({ path, body, options });
        return { success: true };
      },
    } as unknown as LoxtepHttpClient;

    const writer = createHttpQueueWriter({
      http,
      bot_id: 'w-1e6b-a9da-f609-bot-connectors-256-conn-07554a4b',
      queue_name: 'w-1e6b-a9da-f609ddee-queue-conn-07554a4b-ingested',
      instance_id: 'a9da8b2d-5ef0-44ba-80c9-9039f5b9a8f0',
      closedError: () => new Error('closed'),
    });

    writer.write({ case: 'ordered' });
    writer.write({ case: 'bad_status' }, { event_source_timestamp: 1_700_000_000_000 });
    expect(posts).toHaveLength(0);

    await writer.close();

    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe(
      '/observe/queues/w-1e6b-a9da-f609ddee-queue-conn-07554a4b-ingested/events'
    );
    expect(posts[0].options).toEqual({
      headers: { 'x-loxtep-instance-id': 'a9da8b2d-5ef0-44ba-80c9-9039f5b9a8f0' },
    });
    const body = posts[0].body as { queue_id: string; events: Array<Record<string, unknown>> };
    expect(body.queue_id).toBe('w-1e6b-a9da-f609ddee-queue-conn-07554a4b-ingested');
    expect(body.events).toEqual([
      {
        id: 'w-1e6b-a9da-f609-bot-connectors-256-conn-07554a4b',
        event: 'w-1e6b-a9da-f609ddee-queue-conn-07554a4b-ingested',
        payload: { case: 'ordered' },
      },
      {
        id: 'w-1e6b-a9da-f609-bot-connectors-256-conn-07554a4b',
        event: 'w-1e6b-a9da-f609ddee-queue-conn-07554a4b-ingested',
        payload: { case: 'bad_status' },
        event_source_timestamp: 1_700_000_000_000,
      },
    ]);
  });

  it('rejects close() with StreamingError when the proxy returns Forbidden', async () => {
    const http = {
      post: async () => {
        throw new Error('Forbidden: queue write not allowed for active instance namespace');
      },
    } as unknown as LoxtepHttpClient;

    const writer = createHttpQueueWriter({
      http,
      bot_id: 'bot',
      queue_name: 'q',
      instance_id: 'inst',
      closedError: () => new Error('closed'),
    });
    writer.write({ a: 1 });
    await expect(writer.close()).rejects.toBeInstanceOf(StreamingError);
    // Failed flush leaves the writer open so close can be retried after fixing auth.
    await expect(writer.close()).rejects.toBeInstanceOf(StreamingError);
  });

  it('throws closedError after close', async () => {
    const http = {
      post: async () => ({ success: true }),
    } as unknown as LoxtepHttpClient;
    const writer = createHttpQueueWriter({
      http,
      bot_id: 'bot',
      queue_name: 'q',
      instance_id: 'inst',
      closedError: () => new Error('writer is closed'),
    });
    await writer.close();
    expect(() => writer.write({ a: 1 })).toThrow('writer is closed');
  });
});
