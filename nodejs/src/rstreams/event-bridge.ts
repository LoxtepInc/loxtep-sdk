/**
 * Map stream read wrappers to the SDK queue event shape; write payloads via putEvent / putEvents.
 */

import type { RStreamsSdk, ReadEvent } from 'leo-sdk';
import type { QueueEvent, WriteOptions } from '../client/queue-types.js';
import type { FlowWriter } from '../client/flow-types.js';

function readEventToQueueEvent<T>(wrapper: ReadEvent<T>): QueueEvent {
  const w = wrapper as ReadEvent<T> & {
    event?: string;
    id?: string;
    eid?: string;
    correlation_id?: unknown;
    payload?: unknown;
  };
  const event_id =
    (typeof w.id === 'string' && w.id) ||
    (typeof w.eid === 'string' && w.eid) ||
    (typeof (w as { event_id?: string }).event_id === 'string' &&
      (w as unknown as { event_id: string }).event_id) ||
    '';
  return {
    event_id,
    event_type: typeof w.event === 'string' ? w.event : undefined,
    payload: (w.payload ?? w) as Record<string, unknown>,
    correlation_id: w.correlation_id as QueueEvent['correlation_id'],
  };
}

/**
 * Build the rstreams envelope for a business object. The source bot is set by the writer
 * (`rsdk.load(botId, …)`), so we deliberately emit NO top-level `id` — in rstreams that is the
 * SOURCE-BOT identity, and letting a caller's record id land there registers a bogus bot per record
 * in LeoCron. The business object is always the `payload`.
 */
export function toLeoEnvelope(businessObject: unknown, options?: WriteOptions): Record<string, unknown> {
  const env: Record<string, unknown> = { payload: businessObject };
  const ts = options?.event_source_timestamp;
  if (ts != null) {
    const ms = typeof ts === 'number' ? ts : Date.parse(String(ts));
    if (!Number.isNaN(ms)) env.event_source_timestamp = ms;
  }
  return env;
}

/** Minimal shape of the rstreams `load` write stream we rely on. */
interface LeoLoadStream {
  write(chunk: unknown): boolean;
  end(cb: (err?: unknown) => void): void;
}

/**
 * Thin queue writer over the rstreams `load` stream. The rstreams SDK owns buffering, batching,
 * backoff, and checkpointing — this wrapper does NOT buffer or retry; it only wraps each business
 * object into a leo envelope (source = `botId`) and forwards it to `rsdk.load(botId, queueName)`,
 * then flushes on `close()`. Callers pass the business object to `write()`.
 */
export function createQueueWriter(
  rsdk: RStreamsSdk,
  botId: string,
  queueName: string,
  closedError: () => Error
): FlowWriter {
  const stream = (
    rsdk as unknown as { load: (b: string, q: string) => LeoLoadStream }
  ).load(botId, queueName);
  let closed = false;

  return {
    write(event: unknown, options?: WriteOptions): void {
      if (closed) throw closedError();
      stream.write(toLeoEnvelope(event, options));
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) =>
        stream.end(err => (err ? reject(err) : resolve()))
      );
    },
  };
}

/**
 * Read up to `limit` events from `inQueue` acting as bot `id`, then return (mapped events, last start for next page).
 * Uses one offloadEvents invocation per batch (stream checkpoints advance between calls).
 */
export type ReadQueueBatchResult = { events: QueueEvent[]; next_start: string | undefined };

export async function readQueueBatch<T = unknown>(
  rsdk: RStreamsSdk,
  id: string,
  inQueue: string,
  limit: number,
  start?: string | null
): Promise<ReadQueueBatchResult> {
  const collected: QueueEvent[] = [];
  // Stream runtime transform/callback typings vary by version; keep runtime-correct shape.
  await (
    rsdk as unknown as { offloadEvents: (o: Record<string, unknown>) => Promise<void> }
  ).offloadEvents({
    id,
    inQueue,
    limit,
    loops: 3,
    start: start ?? undefined,
    transform(_payload: T, wrapper: ReadEvent<T>, callback?: (err?: unknown) => void) {
      collected.push(readEventToQueueEvent(wrapper));
      if (typeof callback === 'function') callback();
    },
  });
  const last = collected[collected.length - 1];
  return {
    events: collected,
    next_start: last?.event_id || undefined,
  };
}
