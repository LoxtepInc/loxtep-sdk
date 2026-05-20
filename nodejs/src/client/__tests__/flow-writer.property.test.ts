/**
 * Property-based tests for FlowWriter — write-then-close flush and retry behavior.
 * Covers Properties 5 and 6 from the SDK Connector Loop design document.
 */

import { jest } from '@jest/globals';
import fc from 'fast-check';
import { createFlowsApi } from '../flows';
import { StreamingError } from '../../errors/streaming';
import type { LoxtepHttpClient } from '../../http/client';
import type { RStreamsSdk } from '../../rstreams/leo-runtime';

/* ------------------------------------------------------------------ */
/*  Eliminate real backoff delays in retry tests                       */
/* ------------------------------------------------------------------ */

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Minimal mock HTTP client — FlowWriter doesn't use HTTP for writes. */
function mockHttp(): LoxtepHttpClient {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  } as unknown as LoxtepHttpClient;
}

/** Mock RStreams SDK that records putEvents calls in order. */
function mockRsdk(): { rsdk: RStreamsSdk; calls: Array<{ events: unknown[]; opts: unknown }> } {
  const calls: Array<{ events: unknown[]; opts: unknown }> = [];
  const rsdk = {
    putEvents: jest.fn(async (events: unknown[], opts: unknown) => {
      calls.push({ events, opts });
    }),
  } as unknown as RStreamsSdk;
  return { rsdk, calls };
}

/**
 * Flush a writer.close() while advancing fake timers so backoff sleeps resolve.
 * Returns the promise result (resolved or rejected).
 */
async function closeWithTimerAdvance(closePromise: Promise<void>): Promise<void> {
  // Advance timers repeatedly to resolve any pending setTimeout calls from backoff
  for (let i = 0; i < 10; i++) {
    jest.advanceTimersByTime(5000);
    // Yield to allow microtasks (promise callbacks) to run
    await Promise.resolve();
  }
  return closePromise;
}

/* ------------------------------------------------------------------ */
/*  Arbitraries                                                       */
/* ------------------------------------------------------------------ */

/**
 * Arbitrary that produces simple event objects with a unique `id` field
 * and optional extra keys. Keeps events small to avoid slow serialization.
 */
const eventArb: fc.Arbitrary<Record<string, unknown>> = fc.record({
  id: fc.integer({ min: 0, max: 100_000 }),
  type: fc.constantFrom('click', 'view', 'purchase', 'signup'),
  value: fc.oneof(fc.integer(), fc.string({ maxLength: 20 }), fc.boolean()),
});

/**
 * Non-empty array of events (1–200 items). Keeps sequences manageable
 * while still exercising batching boundaries.
 */
const eventSequenceArb: fc.Arbitrary<Record<string, unknown>[]> = fc.array(eventArb, {
  minLength: 1,
  maxLength: 200,
});

/* ------------------------------------------------------------------ */
/*  Property 5: FlowWriter write-then-close flushes all events        */
/* ------------------------------------------------------------------ */

/**
 * Property 5: FlowWriter write-then-close flushes all events
 *
 * For any non-empty sequence of event objects written to a FlowWriter
 * via writer.write(event), calling writer.close() SHALL flush all
 * buffered events to the stream bus via putPayloadsToQueue(),
 * preserving the original order and count.
 *
 * **Validates: Requirements 7.2, 7.3**
 */
describe('Property 5: FlowWriter write-then-close flushes all events', () => {
  it('all written events are flushed to stream bus in order', async () => {
    await fc.assert(
      fc.asyncProperty(eventSequenceArb, async (events) => {
        const { rsdk, calls } = mockRsdk();
        const api = createFlowsApi(mockHttp(), { rsdk });
        const writer = api.get_writer('flow-prop-5', {
          bot_id: 'bot-prop-5',
          output_queue_name: 'queue-prop-5',
        });

        // Write all events
        for (const event of events) {
          writer.write(event);
        }

        // Close flushes everything (no retries needed — mock always succeeds)
        await closeWithTimerAdvance(writer.close());

        // Collect all flushed events across batches (default batch_size=100)
        const flushed = calls.flatMap((c) => c.events);

        // Count must match
        expect(flushed).toHaveLength(events.length);

        // Order must be preserved
        for (let i = 0; i < events.length; i++) {
          expect(flushed[i]).toEqual(events[i]);
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it('all written events are flushed with correct bot_id and queue', async () => {
    await fc.assert(
      fc.asyncProperty(eventSequenceArb, async (events) => {
        const { rsdk, calls } = mockRsdk();
        const api = createFlowsApi(mockHttp(), { rsdk });
        const writer = api.get_writer('flow-prop-5b', {
          bot_id: 'bot-check',
          output_queue_name: 'queue-check',
        });

        for (const event of events) {
          writer.write(event);
        }
        await closeWithTimerAdvance(writer.close());

        // Every batch call must target the correct bot and queue
        for (const call of calls) {
          expect(call.opts).toEqual({ botId: 'bot-check', queue: 'queue-check' });
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it('batching respects batch_size while preserving total count and order', async () => {
    const batchSizeArb = fc.integer({ min: 1, max: 50 });

    await fc.assert(
      fc.asyncProperty(
        eventSequenceArb,
        batchSizeArb,
        async (events, batchSize) => {
          const { rsdk, calls } = mockRsdk();
          const api = createFlowsApi(mockHttp(), { rsdk });
          const writer = api.get_writer('flow-prop-5c', {
            bot_id: 'bot-batch',
            output_queue_name: 'queue-batch',
            batch_size: batchSize,
          });

          for (const event of events) {
            writer.write(event);
          }
          await closeWithTimerAdvance(writer.close());

          // Expected number of batches
          const expectedBatches = Math.ceil(events.length / batchSize);
          expect(calls).toHaveLength(expectedBatches);

          // Each batch (except possibly the last) should have exactly batchSize events
          for (let i = 0; i < calls.length - 1; i++) {
            expect(calls[i].events).toHaveLength(batchSize);
          }
          // Last batch has the remainder
          const lastBatchSize = events.length % batchSize || batchSize;
          expect(calls[calls.length - 1].events).toHaveLength(lastBatchSize);

          // Total flushed events match and preserve order
          const flushed = calls.flatMap((c) => c.events);
          expect(flushed).toHaveLength(events.length);
          for (let i = 0; i < events.length; i++) {
            expect(flushed[i]).toEqual(events[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});

/* ------------------------------------------------------------------ */
/*  Property 6: FlowWriter retry on transient errors                  */
/* ------------------------------------------------------------------ */

/**
 * Mock RStreams SDK that fails on specific attempts and succeeds on others.
 * `failPattern` is an array of booleans: true = fail (transient), false = succeed.
 * The mock uses the pattern for each putEvents call attempt in order.
 * Once the pattern is exhausted, all subsequent calls succeed.
 */
function mockRsdkWithPattern(
  failPattern: boolean[],
): { rsdk: RStreamsSdk; attemptCount: () => number } {
  let attempts = 0;
  const rsdk = {
    putEvents: jest.fn(async () => {
      const idx = attempts;
      attempts++;
      const shouldFail = idx < failPattern.length ? failPattern[idx] : false;
      if (shouldFail) {
        throw Object.assign(new Error('Service unavailable'), { status_code: 503 });
      }
    }),
  } as unknown as RStreamsSdk;
  return { rsdk, attemptCount: () => attempts };
}

/**
 * Arbitrary that generates a retry scenario:
 * - `succeedOnAttempt`: which attempt (1-based) succeeds, or 0 if all fail
 * - maxRetries is fixed at 3 per the design spec
 *
 * For succeedOnAttempt=1: no failures, first attempt succeeds
 * For succeedOnAttempt=2: first attempt fails, second succeeds
 * For succeedOnAttempt=3: first two fail, third succeeds
 * For succeedOnAttempt=0: all 3 attempts fail → StreamingError
 */
const retryScenarioArb: fc.Arbitrary<{ succeedOnAttempt: number }> = fc
  .integer({ min: 0, max: 3 })
  .map((n) => ({ succeedOnAttempt: n }));

/**
 * Property 6: FlowWriter retry on transient errors
 *
 * For any sequence of write attempts where the stream bus returns
 * transient errors, the FlowWriter SHALL retry with exponential
 * backoff up to 3 attempts. If any retry succeeds, the write SHALL
 * complete successfully. If all 3 attempts fail, the writer SHALL
 * throw a StreamingError.
 *
 * **Validates: Requirements 7.5**
 */
describe('Property 6: FlowWriter retry on transient errors', () => {
  it('succeeds if any attempt within max_retries succeeds; throws StreamingError if all fail', async () => {
    await fc.assert(
      fc.asyncProperty(retryScenarioArb, async ({ succeedOnAttempt }) => {
        const maxRetries = 3;

        // Build fail pattern: fail on attempts before succeedOnAttempt, succeed on that attempt
        // succeedOnAttempt=0 means all fail
        const failPattern: boolean[] = [];
        if (succeedOnAttempt === 0) {
          // All attempts fail
          for (let i = 0; i < maxRetries; i++) failPattern.push(true);
        } else {
          // Fail on attempts before succeedOnAttempt, succeed on succeedOnAttempt
          for (let i = 1; i < succeedOnAttempt; i++) failPattern.push(true);
          failPattern.push(false); // success on this attempt
        }

        const { rsdk, attemptCount } = mockRsdkWithPattern(failPattern);
        const api = createFlowsApi(mockHttp(), { rsdk });
        const writer = api.get_writer('flow-prop-6', {
          bot_id: 'bot-prop-6',
          output_queue_name: 'queue-prop-6',
          max_retries: maxRetries,
        });

        writer.write({ id: 1 });

        if (succeedOnAttempt === 0) {
          // All attempts fail → StreamingError
          const closePromise = writer.close();
          // Advance timers to resolve backoff delays
          for (let i = 0; i < 10; i++) {
            jest.advanceTimersByTime(5000);
            await Promise.resolve();
          }
          await expect(closePromise).rejects.toThrow(StreamingError);
          expect(attemptCount()).toBe(maxRetries);
        } else {
          // Should succeed
          await closeWithTimerAdvance(writer.close());
          expect(attemptCount()).toBe(succeedOnAttempt);
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it('non-transient errors fail immediately without retry', async () => {
    // Generate various non-transient status codes
    const nonTransientStatusArb = fc.constantFrom(400, 401, 403, 404);

    await fc.assert(
      fc.asyncProperty(nonTransientStatusArb, async (statusCode) => {
        let attempts = 0;
        const rsdk = {
          putEvents: jest.fn(async () => {
            attempts++;
            throw Object.assign(new Error(`HTTP ${statusCode}`), { status_code: statusCode });
          }),
        } as unknown as RStreamsSdk;

        const api = createFlowsApi(mockHttp(), { rsdk });
        const writer = api.get_writer('flow-prop-6-nontransient', {
          bot_id: 'bot-prop-6',
          output_queue_name: 'queue-prop-6',
          max_retries: 3,
        });

        writer.write({ id: 1 });

        const closePromise = writer.close();
        for (let i = 0; i < 10; i++) {
          jest.advanceTimersByTime(5000);
          await Promise.resolve();
        }
        await expect(closePromise).rejects.toThrow(StreamingError);
        // Non-transient errors should fail on first attempt — no retries
        expect(attempts).toBe(1);
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it('transient errors (5xx, 429, network codes) are retried', async () => {
    const transientErrorArb = fc.constantFrom(
      { status_code: 500 },
      { status_code: 502 },
      { status_code: 503 },
      { status_code: 504 },
      { status_code: 429 },
      { code: 'ECONNRESET' },
      { code: 'ETIMEDOUT' },
      { code: 'ECONNREFUSED' },
    );

    await fc.assert(
      fc.asyncProperty(transientErrorArb, async (errorProps) => {
        // Fail once, then succeed
        let attempts = 0;
        const rsdk = {
          putEvents: jest.fn(async () => {
            attempts++;
            if (attempts === 1) {
              throw Object.assign(new Error('transient'), errorProps);
            }
            // Second attempt succeeds
          }),
        } as unknown as RStreamsSdk;

        const api = createFlowsApi(mockHttp(), { rsdk });
        const writer = api.get_writer('flow-prop-6-transient', {
          bot_id: 'bot-prop-6',
          output_queue_name: 'queue-prop-6',
          max_retries: 3,
        });

        writer.write({ id: 1 });
        await closeWithTimerAdvance(writer.close());

        // Should have retried: 1 failure + 1 success = 2 attempts
        expect(attempts).toBe(2);
      }),
      { numRuns: 100 },
    );
  }, 30000);
});
