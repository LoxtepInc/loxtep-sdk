/**
 * Map stream read wrappers to the SDK queue event shape; write payloads via putEvent / putEvents.
 */

import type { RStreamsSdk, ReadEvent } from 'leo-sdk';
import type { QueueEvent } from '../client/queue-types.js';

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

export async function putPayloadsToQueue(
  rsdk: RStreamsSdk,
  botId: string,
  queueName: string,
  payloads: unknown[]
): Promise<void> {
  if (payloads.length === 0) return;
  const events = payloads.map(p =>
    p !== null && typeof p === 'object' && 'payload' in (p as object) ? p : p
  );
  await rsdk.putEvents(events as never[], { botId, queue: queueName });
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
