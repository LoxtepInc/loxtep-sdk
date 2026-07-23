# Event replay cookbook

Replay events from a data product or from a queue. This is a key differentiator
for the Loxtep SDK: you can iterate over historical or live events without
managing checkpoints yourself (or use checkpoints for resumable replay).

Since **v0.7.0**, control-plane data product methods live under
**`client.build.data_products`**; low-level queue I/O is on **`client.observe`**.
Live write/read by name uses top-level **`client.get_writer`** /
**`client.get_reader`**.

## Replay from a data product

Use `client.build.data_products.replay()` to read events for a data product by ID.
You can optionally pass a start position and batch size.

```ts
import { LoxtepClient } from '@loxtep/sdk';

const client = new LoxtepClient({
  api_url: 'https://api.loxtep.com',
  auth: { type: 'jwt', token: process.env.LOXTEP_AUTH_TOKEN! },
});

const dataProductId = '550e8400-e29b-41d4-a716-446655440000';

for await (const event of client.build.data_products.replay(dataProductId)) {
  console.log(event.event_id, event.payload);
}
```

With options (start position, batch size):

```ts
for await (const event of client.build.data_products.replay(dataProductId, {
  start: 'z/100',
  batch_size: 200,
})) {
  process(event);
}
```

## Read from a queue (open_reader)

Use `client.observe.open_reader()` when you want to read from a specific queue by
name (e.g. for observability or debugging). You get a handle with a `read()` async
iterable.

```ts
const reader = await client.observe.open_reader({
  bot_id: 'dev-bot-process',
  queue_name: 'dev-app-notification-requested',
});

for await (const event of reader.read()) {
  console.log(event.event_id, event.payload);
}
```

With options (start, batch_size, checkpoint):

```ts
for await (const event of reader.read({
  start: 'z/0',
  batch_size: 100,
})) {
  process(event);
}
```

## Stream live events from a data product

Use `client.build.data_products.stream()` for a live stream of events (no fixed
start; reads from the current tail).

```ts
for await (const event of client.build.data_products.stream(dataProductId)) {
  console.log(event);
}
```

## Transform and filter with mapStream / filterStream

Use the streaming helpers to transform or filter events without loading
everything into memory.

```ts
import { mapStream, filterStream } from '@loxtep/sdk';

// Only events that pass a predicate
for await (const event of filterStream(
  client.build.data_products.replay(dataProductId),
  e => (e.payload as { type: string }).type === 'order'
)) {
  console.log(event);
}

// Map to a simpler shape
for await (const payload of mapStream(
  client.build.data_products.replay(dataProductId),
  e => e.payload as { id: string; amount: number }
)) {
  console.log(payload.id, payload.amount);
}
```

## Checkpoint (resumable replay)

Use `client.observe.get_reader_checkpoint()` to get the last checkpoint for a
queue and bot, then pass it as `checkpoint` (or `start`) when opening a reader or
replaying so you resume from that position.

```ts
const checkpoint = await client.observe.get_reader_checkpoint(
  'dev-app-notification-requested',
  'dev-bot-process'
);

const reader = await client.observe.open_reader({
  bot_id: 'dev-bot-process',
  queue_name: 'dev-app-notification-requested',
  options: { checkpoint: checkpoint.checkpoint, batch_size: 100 },
});

for await (const event of reader.read()) {
  await processAndSaveCheckpoint(event);
}
```

## Error handling

If the API returns an error (e.g. 429 rate limit), the async iterator will
throw. Wrap in try/catch and optionally retry or back off.

```ts
try {
  for await (const event of client.build.data_products.replay(dataProductId)) {
    process(event);
  }
} catch (err) {
  if (err instanceof RateLimitError) {
    await sleep(err.retry_after_seconds * 1000);
    // retry...
  }
  throw err;
}
```

## Summary

| Use case | Method | When to use |
| --- | --- | --- |
| Replay by data product | `client.build.data_products.replay(id [, options])` | Historical events for a data product |
| Live stream by data product | `client.build.data_products.stream(id)` | Tail of events for a data product |
| Write/read by name | `client.get_writer(name)` / `client.get_reader(name)` | Runtime I/O with auto-resolved deployment metadata |
| Read by queue name | `client.observe.open_reader({ bot_id, queue_name }).read()` | Inspect a specific queue (observe/debug) |
| Resumable read | `observe.get_reader_checkpoint` + `options.checkpoint` | Continue from last position |
| Transform/filter | `mapStream`, `filterStream` | Without loading all events into memory |
