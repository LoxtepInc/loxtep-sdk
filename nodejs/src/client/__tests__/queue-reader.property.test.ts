/**
 * Property-based tests for QueueReader — read yields all events in order.
 * Covers Property 7 from the SDK Connector Loop design document.
 *
 * Feature: sdk-connector-loop
 * Property 7: QueueReader read yields all events in order
 */

import { jest } from '@jest/globals';
import fc from 'fast-check';
import { QueueReader } from '../queues';
import type { QueueEvent } from '../queue-types';
import type { RStreamsSdk } from '../../rstreams/leo-runtime';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Build a mock RStreams SDK whose `offloadEvents` delivers events from a
 * pre-built list, respecting `limit` and `start` pagination.
 *
 * Events are identified by their `event_id` field (string index).
 * The `start` parameter is the event_id of the last event from the
 * previous batch — we resume from the *next* event after that.
 */
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

      // Determine starting index based on `start` cursor
      let startIdx = 0;
      if (start !== undefined) {
        const cursorIdx = allEvents.findIndex((e) => e.event_id === start);
        if (cursorIdx >= 0) {
          startIdx = cursorIdx + 1; // resume after the cursor
        }
      }

      // Slice the batch
      const batch = allEvents.slice(startIdx, startIdx + limit);

      // Deliver each event through the transform callback (mimics offloadEvents behavior)
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
          () => {
            /* no-op callback */
          }
        );
      }
    }),
  } as unknown as RStreamsSdk;
}

/**
 * Collect all events from an async iterable into an array.
 */
async function collectAll<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterable) {
    result.push(item);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Arbitraries                                                       */
/* ------------------------------------------------------------------ */

/**
 * Arbitrary that produces a QueueEvent with a unique sequential event_id
 * and a simple payload. The event_id is derived from the index to ensure
 * uniqueness and deterministic ordering.
 */
function queueEventArb(index: number): fc.Arbitrary<QueueEvent> {
  return fc
    .record({
      type: fc.constantFrom('click', 'view', 'purchase', 'signup', 'update'),
      value: fc.oneof(fc.integer(), fc.string({ maxLength: 20 }), fc.boolean()),
    })
    .map((rec) => ({
      event_id: `eid-${String(index).padStart(6, '0')}`,
      event_type: rec.type,
      payload: { type: rec.type, value: rec.value, index },
      correlation_id: undefined,
    }));
}

/**
 * Arbitrary that produces a list of N QueueEvents (1–200) with sequential,
 * unique event_ids. This ensures a well-defined order for verification.
 */
const queueEventsArb: fc.Arbitrary<QueueEvent[]> = fc
  .integer({ min: 1, max: 200 })
  .chain((n) => {
    const arbs = Array.from({ length: n }, (_, i) => queueEventArb(i));
    return fc.tuple(...(arbs as [fc.Arbitrary<QueueEvent>, ...fc.Arbitrary<QueueEvent>[]]));
  })
  .map((tuple) => [...tuple]);

/**
 * Batch size arbitrary — small values exercise multi-batch pagination,
 * large values exercise single-batch reads.
 */
const batchSizeArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 50 });

/* ------------------------------------------------------------------ */
/*  Property 7: QueueReader read yields all events in order            */
/* ------------------------------------------------------------------ */

/**
 * Property 7: QueueReader read yields all events in order
 *
 * For any queue containing N events, calling reader.read() on a
 * QueueReader SHALL yield an async iterable that produces all N events
 * in the order they were written to the queue.
 *
 * **Validates: Requirements 8.1, 8.2**
 */
describe('Property 7: QueueReader read yields all events in order', () => {
  it('read() yields all N events in original write order', async () => {
    await fc.assert(
      fc.asyncProperty(queueEventsArb, async (events) => {
        const rsdk = mockRsdkWithEvents(events);
        const reader = new QueueReader(rsdk, 'bot-prop-7', 'queue-prop-7');

        const collected = await collectAll(reader.read());

        // Count must match
        expect(collected).toHaveLength(events.length);

        // Order must be preserved — each yielded event matches the original by event_id
        for (let i = 0; i < events.length; i++) {
          expect(collected[i].event_id).toBe(events[i].event_id);
        }
      }),
      { numRuns: 100 },
    );
  }, 60000);

  it('read() yields all events in order with varying batch sizes', async () => {
    await fc.assert(
      fc.asyncProperty(queueEventsArb, batchSizeArb, async (events, batchSize) => {
        const rsdk = mockRsdkWithEvents(events);
        const reader = new QueueReader(rsdk, 'bot-prop-7-batch', 'queue-prop-7-batch', {
          batch_size: batchSize,
        });

        const collected = await collectAll(reader.read());

        // All events must be yielded
        expect(collected).toHaveLength(events.length);

        // Order preserved
        for (let i = 0; i < events.length; i++) {
          expect(collected[i].event_id).toBe(events[i].event_id);
        }
      }),
      { numRuns: 100 },
    );
  }, 60000);

  it('read() on an empty queue yields zero events', async () => {
    const rsdk = mockRsdkWithEvents([]);
    const reader = new QueueReader(rsdk, 'bot-empty', 'queue-empty');

    const collected = await collectAll(reader.read());
    expect(collected).toHaveLength(0);
  });

  it('read() after close() yields no events', async () => {
    await fc.assert(
      fc.asyncProperty(queueEventsArb, async (events) => {
        const rsdk = mockRsdkWithEvents(events);
        const reader = new QueueReader(rsdk, 'bot-closed', 'queue-closed');

        reader.close();
        const collected = await collectAll(reader.read());

        expect(collected).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it('payloads are preserved through the read pipeline', async () => {
    await fc.assert(
      fc.asyncProperty(queueEventsArb, async (events) => {
        const rsdk = mockRsdkWithEvents(events);
        const reader = new QueueReader(rsdk, 'bot-payload', 'queue-payload');

        const collected = await collectAll(reader.read());

        // Verify payload content matches for each event
        for (let i = 0; i < events.length; i++) {
          expect(collected[i].payload).toEqual(events[i].payload);
        }
      }),
      { numRuns: 100 },
    );
  }, 60000);
});
