import { toLeoEnvelope, createQueueWriter } from './event-bridge.js';
import type { RStreamsSdk } from 'leo-sdk';

describe('toLeoEnvelope', () => {
  it('wraps the business object as payload with no envelope id', () => {
    const env = toLeoEnvelope({ id: '1780897203018', total_price: '9.99' });
    expect(env).toEqual({ payload: { id: '1780897203018', total_price: '9.99' } });
    expect('id' in env).toBe(false); // no top-level envelope id (would be the source bot)
    expect(env.event_source_timestamp).toBeUndefined();
  });

  it('sets event_source_timestamp from a numeric (ms epoch) option', () => {
    expect(toLeoEnvelope({ a: 1 }, { event_source_timestamp: 1780897203018 }).event_source_timestamp).toBe(
      1780897203018
    );
  });

  it('parses a date-string event_source_timestamp to ms epoch', () => {
    expect(
      toLeoEnvelope({ a: 1 }, { event_source_timestamp: '2026-06-08 04:00:21' }).event_source_timestamp
    ).toBe(Date.parse('2026-06-08 04:00:21'));
  });

  it('ignores an unparseable timestamp rather than emitting NaN', () => {
    expect(
      toLeoEnvelope({ a: 1 }, { event_source_timestamp: 'not-a-date' }).event_source_timestamp
    ).toBeUndefined();
  });
});

describe('createQueueWriter', () => {
  function fakeRsdk() {
    const loads: Array<{ botId: string; queueName: string }> = [];
    const written: unknown[] = [];
    let ended = false;
    const stream = {
      write(chunk: unknown): boolean {
        written.push(chunk);
        return true;
      },
      end(cb: (err?: unknown) => void): void {
        ended = true;
        cb();
      },
    };
    const rsdk = {
      load: (botId: string, queueName: string) => {
        loads.push({ botId, queueName });
        return stream;
      },
    } as unknown as RStreamsSdk;
    return { rsdk, loads, written, isEnded: () => ended };
  }

  it('opens one load stream with the writer bot_id and forwards envelopes (no record id leaks as source)', async () => {
    const { rsdk, loads, written, isEnded } = fakeRsdk();
    const writer = createQueueWriter(rsdk, 'shopify-seed-importer', 'q-orders', () => new Error('closed'));

    writer.write({ id: '1780897203018', name: 'order' }); // numeric record id in the business object
    writer.write({ id: '1780897203019', name: 'order2' }, { event_source_timestamp: 1780897203018 });
    await writer.close();

    expect(loads).toEqual([{ botId: 'shopify-seed-importer', queueName: 'q-orders' }]); // one stream
    expect(written).toEqual([
      { payload: { id: '1780897203018', name: 'order' } },
      { payload: { id: '1780897203019', name: 'order2' }, event_source_timestamp: 1780897203018 },
    ]);
    // record id stays inside payload; never a top-level envelope `id`
    for (const ev of written) expect('id' in (ev as Record<string, unknown>)).toBe(false);
    expect(isEnded()).toBe(true);
  });

  it('throws (via closedError) when writing after close', async () => {
    const { rsdk } = fakeRsdk();
    const writer = createQueueWriter(rsdk, 'bot', 'q', () => new Error('writer is closed'));
    await writer.close();
    expect(() => writer.write({ a: 1 })).toThrow('writer is closed');
  });
});
