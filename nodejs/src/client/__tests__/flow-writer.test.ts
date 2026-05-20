/**
 * Unit tests for FlowWriter — batching, retry, StreamingError, and close behavior.
 * Covers Tasks 8.1 (FlowWriter with Stream Bus integration) and 8.2 (retry with exponential backoff).
 */

import { jest } from '@jest/globals';
import { createFlowsApi, isTransientError } from '../flows';
import { StreamingError } from '../../errors/streaming';
import type { LoxtepHttpClient } from '../../http/client';
import type { RStreamsSdk } from '../../rstreams/leo-runtime';

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

/** Mock RStreams SDK that records putEvents calls. */
function mockRsdk(): { rsdk: RStreamsSdk; calls: Array<{ events: unknown[]; opts: unknown }> } {
  const calls: Array<{ events: unknown[]; opts: unknown }> = [];
  const rsdk = {
    putEvents: jest.fn(async (events: unknown[], opts: unknown) => {
      calls.push({ events, opts });
    }),
  } as unknown as RStreamsSdk;
  return { rsdk, calls };
}

/** Mock RStreams SDK that fails N times then succeeds. */
function mockRsdkFailThenSucceed(
  failCount: number,
  errorFactory: () => Error
): { rsdk: RStreamsSdk; attemptCount: () => number } {
  let attempts = 0;
  const rsdk = {
    putEvents: jest.fn(async () => {
      attempts++;
      if (attempts <= failCount) {
        throw errorFactory();
      }
    }),
  } as unknown as RStreamsSdk;
  return { rsdk, attemptCount: () => attempts };
}

/** Mock RStreams SDK that always fails. */
function mockRsdkAlwaysFail(
  errorFactory: () => Error
): { rsdk: RStreamsSdk; attemptCount: () => number } {
  let attempts = 0;
  const rsdk = {
    putEvents: jest.fn(async () => {
      attempts++;
      throw errorFactory();
    }),
  } as unknown as RStreamsSdk;
  return { rsdk, attemptCount: () => attempts };
}

/* ------------------------------------------------------------------ */
/*  Tests: Task 8.1 — FlowWriter with Stream Bus integration         */
/* ------------------------------------------------------------------ */

describe('FlowWriter — Stream Bus integration (Task 8.1)', () => {
  it('write() buffers events and close() flushes all to stream bus', async () => {
    const { rsdk, calls } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    writer.write({ id: 1 });
    writer.write({ id: 2 });
    writer.write({ id: 3 });
    await writer.close();

    expect(calls).toHaveLength(1);
    expect(calls[0].events).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(calls[0].opts).toEqual({ botId: 'bot-1', queue: 'test-queue' });
  });

  it('close() with empty buffer succeeds without calling stream bus', async () => {
    const { rsdk, calls } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    await writer.close();

    expect(calls).toHaveLength(0);
  });

  it('close() flushes in batches when buffer exceeds batch_size', async () => {
    const { rsdk, calls } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
      batch_size: 2,
    });

    writer.write({ id: 1 });
    writer.write({ id: 2 });
    writer.write({ id: 3 });
    writer.write({ id: 4 });
    writer.write({ id: 5 });
    await writer.close();

    // 5 events with batch_size=2 → 3 batches: [1,2], [3,4], [5]
    expect(calls).toHaveLength(3);
    expect(calls[0].events).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls[1].events).toEqual([{ id: 3 }, { id: 4 }]);
    expect(calls[2].events).toEqual([{ id: 5 }]);
  });

  it('throws StreamingError when rsdk is not available', async () => {
    const api = createFlowsApi(mockHttp(), { rsdk: undefined });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    writer.write({ id: 1 });

    await expect(writer.close()).rejects.toThrow(StreamingError);
    await expect(
      // Create a fresh writer since the previous one is now closed
      (async () => {
        const w2 = api.get_writer('flow-1', {
          bot_id: 'bot-1',
          output_queue_name: 'test-queue',
        });
        w2.write({ id: 1 });
        await w2.close();
      })()
    ).rejects.toThrow(/Stream bus configuration missing/);
  });

  it('throws StreamingError when bot_id is missing', async () => {
    const { rsdk } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      output_queue_name: 'test-queue',
    });

    writer.write({ id: 1 });

    await expect(writer.close()).rejects.toThrow(StreamingError);
    await expect(
      (async () => {
        const w2 = api.get_writer('flow-1', { output_queue_name: 'test-queue' });
        w2.write({ id: 1 });
        await w2.close();
      })()
    ).rejects.toThrow(/bot_id/);
  });

  it('throws StreamingError when writing to a closed writer', async () => {
    const { rsdk } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    await writer.close();

    expect(() => writer.write({ id: 1 })).toThrow(StreamingError);
    expect(() => writer.write({ id: 1 })).toThrow(/closed FlowWriter/);
  });

  it('close() is idempotent — second call is a no-op', async () => {
    const { rsdk, calls } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    writer.write({ id: 1 });
    await writer.close();
    await writer.close(); // second call — no-op

    expect(calls).toHaveLength(1);
  });

  it('uses default batch_size of 100', async () => {
    const { rsdk, calls } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    // Write 150 events — should produce 2 batches: 100 + 50
    for (let i = 0; i < 150; i++) {
      writer.write({ id: i });
    }
    await writer.close();

    expect(calls).toHaveLength(2);
    expect(calls[0].events).toHaveLength(100);
    expect(calls[1].events).toHaveLength(50);
  });

  it('resolves rsdk lazily via get_rsdk when rsdk is not set', async () => {
    const { rsdk, calls } = mockRsdk();
    const getRsdk = jest.fn(async () => rsdk);
    const api = createFlowsApi(mockHttp(), { get_rsdk: getRsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    writer.write({ id: 1 });
    await writer.close();

    expect(getRsdk).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Task 8.2 — Retry with exponential backoff                  */
/* ------------------------------------------------------------------ */

describe('FlowWriter — retry with exponential backoff (Task 8.2)', () => {
  it('retries transient errors and succeeds when a retry works', async () => {
    const transientError = Object.assign(new Error('Service unavailable'), { status_code: 503 });
    const { rsdk, attemptCount } = mockRsdkFailThenSucceed(2, () => transientError);
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
      max_retries: 3,
    });

    writer.write({ id: 1 });
    await writer.close();

    // 2 failures + 1 success = 3 attempts
    expect(attemptCount()).toBe(3);
  });

  it('throws StreamingError after max_retries transient failures', async () => {
    const transientError = Object.assign(new Error('Gateway timeout'), { status_code: 504 });
    const { rsdk, attemptCount } = mockRsdkAlwaysFail(() => transientError);
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
      max_retries: 3,
    });

    writer.write({ id: 1 });

    try {
      await writer.close();
      fail('Expected StreamingError');
    } catch (err) {
      expect(err).toBeInstanceOf(StreamingError);
      expect((err as StreamingError).message).toContain('Failed to write events after 3 attempts');
    }
    // All 3 retry attempts were made
    expect(attemptCount()).toBe(3);
  }, 10000);

  it('fails immediately on non-transient errors (4xx, auth)', async () => {
    const authError = Object.assign(new Error('Unauthorized'), {
      status_code: 401,
      code: 'AUTHENTICATION_ERROR',
    });
    const { rsdk, attemptCount } = mockRsdkAlwaysFail(() => authError);
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
      max_retries: 3,
    });

    writer.write({ id: 1 });

    await expect(writer.close()).rejects.toThrow(StreamingError);
    // Should fail on first attempt — no retries
    expect(attemptCount()).toBe(1);
  });

  it('retries 429 (throttling) as transient', async () => {
    const throttleError = Object.assign(new Error('Too many requests'), { status_code: 429 });
    const { rsdk, attemptCount } = mockRsdkFailThenSucceed(1, () => throttleError);
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
      max_retries: 3,
    });

    writer.write({ id: 1 });
    await writer.close();

    // 1 failure + 1 success = 2 attempts
    expect(attemptCount()).toBe(2);
  });

  it('fails immediately on 400 (validation error)', async () => {
    const validationError = Object.assign(new Error('Bad request'), {
      status_code: 400,
      code: 'VALIDATION_ERROR',
    });
    const { rsdk, attemptCount } = mockRsdkAlwaysFail(() => validationError);
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
      max_retries: 3,
    });

    writer.write({ id: 1 });

    await expect(writer.close()).rejects.toThrow(StreamingError);
    expect(attemptCount()).toBe(1);
  });

  it('retries network errors (ECONNRESET) as transient', async () => {
    const networkError = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
    const { rsdk, attemptCount } = mockRsdkFailThenSucceed(1, () => networkError);
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
      max_retries: 3,
    });

    writer.write({ id: 1 });
    await writer.close();

    expect(attemptCount()).toBe(2);
  });

  it('retries timeout errors as transient', async () => {
    const timeoutError = Object.assign(new Error('Request timeout'), { code: 'ETIMEDOUT' });
    const { rsdk, attemptCount } = mockRsdkFailThenSucceed(2, () => timeoutError);
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
      max_retries: 3,
    });

    writer.write({ id: 1 });
    await writer.close();

    expect(attemptCount()).toBe(3);
  });

  it('includes last error details in StreamingError after exhausting retries', async () => {
    const transientError = new Error('Kinesis write failed: throughput exceeded');
    const { rsdk } = mockRsdkAlwaysFail(() => transientError);
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
      max_retries: 3,
    });

    writer.write({ id: 1 });

    try {
      await writer.close();
      fail('Expected StreamingError');
    } catch (err) {
      expect(err).toBeInstanceOf(StreamingError);
      const streamErr = err as StreamingError;
      expect(streamErr.message).toContain('Kinesis write failed: throughput exceeded');
      expect(streamErr.message).toContain('after 3 attempts');
      expect(streamErr.details?.attempts).toBe(3);
      expect(streamErr.details?.transient).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: isTransientError helper                                    */
/* ------------------------------------------------------------------ */

describe('isTransientError', () => {
  it('returns true for 5xx status codes', () => {
    expect(isTransientError({ status_code: 500 })).toBe(true);
    expect(isTransientError({ status_code: 502 })).toBe(true);
    expect(isTransientError({ status_code: 503 })).toBe(true);
    expect(isTransientError({ status_code: 504 })).toBe(true);
  });

  it('returns true for 429 (throttling)', () => {
    expect(isTransientError({ status_code: 429 })).toBe(true);
  });

  it('returns false for 4xx (except 429)', () => {
    expect(isTransientError({ status_code: 400 })).toBe(false);
    expect(isTransientError({ status_code: 401 })).toBe(false);
    expect(isTransientError({ status_code: 403 })).toBe(false);
    expect(isTransientError({ status_code: 404 })).toBe(false);
  });

  it('returns true for network error codes', () => {
    expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransientError({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isTransientError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTransientError({ code: 'EPIPE' })).toBe(true);
  });

  it('returns false for auth error codes', () => {
    expect(isTransientError({ code: 'AUTHENTICATION_ERROR' })).toBe(false);
    expect(isTransientError({ code: 'AUTHORIZATION_ERROR' })).toBe(false);
  });

  it('returns true for timeout-related error messages', () => {
    expect(isTransientError(new Error('Request timeout'))).toBe(true);
    expect(isTransientError(new Error('socket hang up'))).toBe(true);
    expect(isTransientError(new Error('network error'))).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});
