/**
 * Property-based tests for FlowWriter via flows.get_writer().
 */

import fc from 'fast-check';
import { createFlowsApi } from '../flows';
import type { LoxtepHttpClient } from '../../http/client';
import type { RStreamsSdk } from '../../rstreams/leo-runtime';

function mockHttp(): LoxtepHttpClient {
  return {
    get: async () => ({}),
    post: async () => ({}),
    put: async () => ({}),
    patch: async () => ({}),
    delete: async () => ({}),
  } as unknown as LoxtepHttpClient;
}

function mockRsdk(): {
  rsdk: RStreamsSdk;
  written: unknown[];
} {
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
    load: () => stream,
  } as unknown as RStreamsSdk;
  return { rsdk, written };
}

const eventArb: fc.Arbitrary<Record<string, unknown>> = fc.record({
  id: fc.integer({ min: 0, max: 100_000 }),
  type: fc.constantFrom('click', 'view', 'purchase', 'signup'),
});

describe('FlowWriter property tests', () => {
  it('write-then-close preserves every event as a payload envelope', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(eventArb, { minLength: 1, maxLength: 50 }), async (events) => {
        const { rsdk, written } = mockRsdk();
        const api = createFlowsApi(mockHttp(), { rsdk });
        const writer = await api.get_writer('flow-1', {
          bot_id: 'bot-1',
          output_queue_name: 'test-queue',
        });

        for (const event of events) {
          writer.write(event);
        }
        await writer.close();

        expect(written).toHaveLength(events.length);
        for (let i = 0; i < events.length; i++) {
          expect(written[i]).toEqual({ payload: events[i] });
        }
      }),
      { numRuns: 25 }
    );
  });
});
