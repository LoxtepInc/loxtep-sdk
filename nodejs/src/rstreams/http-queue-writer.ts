/**
 * HTTP observe-proxy queue writer for self-hosted (customer-account) buses.
 *
 * BusWriter STS from `loxtep login` is scoped to the central Loxtep account and
 * cannot PutRecords into a customer-account Kinesis stream. Platform
 * POST /observe/queues/{queue_id}/events assumes the instance observe role and
 * writes on the caller's behalf while enforcing namespace isolation.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { FlowWriter } from '../client/flow-types.js';
import type { WriteOptions } from '../client/queue-types.js';
import { StreamingError } from '../errors/streaming.js';

export type CreateHttpQueueWriterParams = {
  http: LoxtepHttpClient;
  bot_id: string;
  queue_name: string;
  instance_id: string;
  /** Optional context for StreamingError details. */
  data_product_id?: string;
  /** Max events per HTTP POST. Default 100. */
  batch_size?: number;
  closedError: () => Error;
};

/**
 * Buffered writer that POSTs Leo envelopes to the observe queue-events proxy.
 * `write` buffers; `close` flushes (rejects on HTTP / authorization errors).
 */
export function createHttpQueueWriter(params: CreateHttpQueueWriterParams): FlowWriter {
  const batchSize = params.batch_size && params.batch_size > 0 ? params.batch_size : 100;
  const buffer: Record<string, unknown>[] = [];
  let closed = false;

  const instanceHeaders = {
    'x-loxtep-instance-id': params.instance_id,
  };

  async function postEvents(events: Record<string, unknown>[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await params.http.post(
        `/observe/queues/${encodeURIComponent(params.queue_name)}/events`,
        { queue_id: params.queue_name, events },
        { headers: instanceHeaders }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new StreamingError(
        `HTTP queue write failed for '${params.queue_name}': ${message}`,
        {
          details: {
            queue_name: params.queue_name,
            bot_id: params.bot_id,
            instance_id: params.instance_id,
            data_product_id: params.data_product_id,
            event_count: events.length,
            transport: 'http_proxy',
            hint:
              'Self-hosted writes use the observe proxy. Verify instance selection, instances:read, and that the queue belongs to this instance namespace.',
          },
        }
      );
    }
  }

  async function flushAll(): Promise<void> {
    while (buffer.length > 0) {
      const chunk = buffer.slice(0, batchSize);
      await postEvents(chunk);
      // Only drop buffered events after a successful POST so close() can retry.
      buffer.splice(0, chunk.length);
    }
  }

  return {
    write(event: unknown, options?: WriteOptions): void {
      if (closed) throw params.closedError();
      const envelope: Record<string, unknown> = {
        id: params.bot_id,
        event: params.queue_name,
        payload: event,
      };
      const ts = options?.event_source_timestamp;
      if (ts != null) {
        const ms = typeof ts === 'number' ? ts : Date.parse(String(ts));
        if (!Number.isNaN(ms)) envelope.event_source_timestamp = ms;
      }
      buffer.push(envelope);
    },
    async close(): Promise<void> {
      if (closed) return;
      await flushAll();
      closed = true;
    },
  };
}
