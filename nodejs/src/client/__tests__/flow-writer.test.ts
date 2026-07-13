/**
 * Unit tests for FlowWriter via flows.get_writer() and createQueueWriter integration.
 */

import { jest } from '@jest/globals';
import { createFlowsApi, isTransientError } from '../flows';
import { StreamingError } from '../../errors/streaming';
import type { LoxtepHttpClient } from '../../http/client';
import type { RStreamsSdk } from '../../rstreams/leo-runtime';

function mockHttp(): LoxtepHttpClient {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  } as unknown as LoxtepHttpClient;
}

function mockRsdk(): {
  rsdk: RStreamsSdk;
  loads: Array<{ botId: string; queueName: string }>;
  written: unknown[];
} {
  const loads: Array<{ botId: string; queueName: string }> = [];
  const written: unknown[] = [];
  const stream = {
    write(chunk: unknown): boolean {
      written.push(chunk);
      return true;
    },
    end(cb: (err?: unknown) => void): void {
      cb();
    },
  };
  const rsdk = {
    load: (botId: string, queueName: string) => {
      loads.push({ botId, queueName });
      return stream;
    },
  } as unknown as RStreamsSdk;
  return { rsdk, loads, written };
}

describe('FlowWriter — Stream Bus integration', () => {
  it('write() forwards envelopes to the load stream and close() ends it', async () => {
    const { rsdk, loads, written } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = await api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    writer.write({ id: 1 });
    writer.write({ id: 2 });
    await writer.close();

    expect(loads).toEqual([{ botId: 'bot-1', queueName: 'test-queue' }]);
    expect(written).toEqual([{ payload: { id: 1 } }, { payload: { id: 2 } }]);
  });

  it('close() with empty buffer still ends the stream', async () => {
    const { rsdk, loads } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = await api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    await writer.close();

    expect(loads).toEqual([{ botId: 'bot-1', queueName: 'test-queue' }]);
  });

  it('throws StreamingError when rsdk is not available', async () => {
    const api = createFlowsApi(mockHttp(), { rsdk: undefined });

    await expect(
      api.get_writer('flow-1', {
        bot_id: 'bot-1',
        output_queue_name: 'test-queue',
      })
    ).rejects.toThrow(/Stream bus configuration missing/);
  });

  it('throws StreamingError when bot_id is missing', async () => {
    const { rsdk } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });

    await expect(
      api.get_writer('flow-1', {
        output_queue_name: 'test-queue',
      })
    ).rejects.toThrow(/bot_id/);
  });

  it('throws StreamingError when writing to a closed writer', async () => {
    const { rsdk } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = await api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    await writer.close();

    expect(() => writer.write({ id: 1 })).toThrow(StreamingError);
    expect(() => writer.write({ id: 1 })).toThrow(/closed FlowWriter/);
  });

  it('close() is idempotent — second call is a no-op', async () => {
    const { rsdk, loads } = mockRsdk();
    const api = createFlowsApi(mockHttp(), { rsdk });
    const writer = await api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    writer.write({ id: 1 });
    await writer.close();
    await writer.close();

    expect(loads).toHaveLength(1);
  });

  it('resolves rsdk lazily via get_rsdk when rsdk is not set', async () => {
    const { rsdk, written } = mockRsdk();
    const getRsdk = jest.fn(async () => rsdk);
    const api = createFlowsApi(mockHttp(), { get_rsdk: getRsdk });
    const writer = await api.get_writer('flow-1', {
      bot_id: 'bot-1',
      output_queue_name: 'test-queue',
    });

    writer.write({ id: 1 });
    await writer.close();

    expect(getRsdk).toHaveBeenCalledTimes(1);
    expect(written).toHaveLength(1);
  });
});

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
