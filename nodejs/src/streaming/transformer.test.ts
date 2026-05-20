import { mapStream, filterStream } from './transformer.js';

async function* toStream<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe('mapStream', () => {
  it('yields transformed events', async () => {
    const stream = toStream([
      { event_id: '1', payload: { x: 1 } },
      { event_id: '2', payload: { x: 2 } },
    ]);
    const out: number[] = [];
    for await (const v of mapStream(stream, e => (e.payload as { x: number }).x)) {
      out.push(v);
    }
    expect(out).toEqual([1, 2]);
  });

  it('supports async transform', async () => {
    const stream = toStream([1, 2, 3]);
    const out: number[] = [];
    for await (const v of mapStream(stream, async n => n * 2)) {
      out.push(v);
    }
    expect(out).toEqual([2, 4, 6]);
  });
});

describe('filterStream', () => {
  it('yields only matching events', async () => {
    const stream = toStream([
      { event_id: '1', payload: { ok: true } },
      { event_id: '2', payload: { ok: false } },
      { event_id: '3', payload: { ok: true } },
    ]);
    const out: unknown[] = [];
    for await (const e of filterStream(stream, e => (e.payload as { ok: boolean }).ok)) {
      out.push(e);
    }
    expect(out).toHaveLength(2);
    expect((out[0] as { event_id: string }).event_id).toBe('1');
    expect((out[1] as { event_id: string }).event_id).toBe('3');
  });

  it('supports async predicate', async () => {
    const stream = toStream([1, 2, 3, 4, 5]);
    const out: number[] = [];
    for await (const n of filterStream(stream, async n => n % 2 === 0)) {
      out.push(n);
    }
    expect(out).toEqual([2, 4]);
  });
});
