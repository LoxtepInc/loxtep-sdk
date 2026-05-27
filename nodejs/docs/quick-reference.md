# SDK Quick Reference Card

Concise cheat sheet for common Loxtep SDK operations. For full walkthroughs,
see the [Getting Started Guide](./getting-started.md).

---

## Client Initialization

### Node.js

```typescript
import { LoxtepClient } from '@loxtep/sdk';

const client = new LoxtepClient({
  api_url: process.env.LOXTEP_API_URL,
  organization_id: process.env.LOXTEP_ORGANIZATION_ID,
  project_id: process.env.LOXTEP_PROJECT_ID,
  instance_id: process.env.LOXTEP_INSTANCE_ID,
  region: process.env.LOXTEP_REGION,
});
```

### Python

```python
import os
from loxtep import LoxtepClient

client = LoxtepClient(
    api_url=os.environ["LOXTEP_API_URL"],
    organization_id=os.environ["LOXTEP_ORGANIZATION_ID"],
    project_id=os.environ["LOXTEP_PROJECT_ID"],
    instance_id=os.environ["LOXTEP_INSTANCE_ID"],
    region=os.environ["LOXTEP_REGION"],
)
```

> If you ran `loxtep init`, the SDK reads defaults from
> `~/.loxtep/config.json` — you can use `new LoxtepClient()` with no args.

---

## Writing Events

**Recommended: use `data_products.get_writer('name')`** — the SDK resolves
queue, bot_id, and stream bus config automatically from deployment metadata.

### Node.js

```typescript
// Resolve by name — no manual queue/bot/stream config needed
const writer = await client.data_products.get_writer('my-data-product');

writer.write({ id: 'evt-1', payload: { key: 'value' } });
writer.write({ id: 'evt-2', payload: { key: 'value' } });

await writer.close(); // flushes all buffered events
```

### Python

```python
# Resolve by name — no manual queue/bot/stream config needed
writer = await client.data_products.get_writer("my-data-product")

writer.write({"id": "evt-1", "payload": {"key": "value"}})
writer.write({"id": "evt-2", "payload": {"key": "value"}})

await writer.close()  # flushes all buffered events
```

### Lower-level escape hatch (explicit control)

```typescript
// Only use when you need manual bot_id/queue control
const writer = client.flows.get_writer('<flow_id>', {
  bot_id: 'my-bot',
  output_queue_name: 'raw-events',
});
writer.write({ id: 'evt-1', payload: { key: 'value' } });
await writer.close();
```

---

## Reading Events

**Recommended: use `data_products.get_reader('name')`** — resolves everything
automatically.

### Node.js

```typescript
const reader = await client.data_products.get_reader('my-data-product');

for await (const event of reader) {
  console.log(event);
}
```

### Python

```python
reader = await client.data_products.get_reader("my-data-product")

for event in reader:
    print(event)
```

### Lower-level escape hatch (explicit control)

```typescript
const reader = await client.queues.open_reader({
  bot_id: 'my-reader',
  queue_name: 'raw-events',
});
for await (const event of reader.read()) {
  console.log(event);
}
reader.close();
```

---

## Data Products

### Stream Live Events

#### Node.js

```typescript
const stream = await client.data_products.stream('<data_product_id>', {
  bot_id: 'my-stream-bot',
});

for await (const event of stream) {
  console.log(event);
}
```

#### Python

```python
stream = client.data_products.stream("<data_product_id>", {
    "bot_id": "my-stream-bot",
})

for event in stream:
    print(event)
```

### Replay Historical Events

#### Node.js

```typescript
const events = await client.data_products.replay('<data_product_id>', {
  start: '2024-01-01T00:00:00Z',
  end: '2024-01-02T00:00:00Z',
});
```

#### Python

```python
events = client.data_products.replay("<data_product_id>", {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-02T00:00:00Z",
})
```

### List and Get Data Products

#### Node.js

```typescript
const products = await client.data_products.list();
const product = await client.data_products.get('<data_product_id>');
```

#### Python

```python
products = client.data_products.list()
product = client.data_products.get("<data_product_id>")
```

---

## Flows and Connectors

### List Flows

#### Node.js

```typescript
const flows = await client.flows.list();
```

#### Python

```python
flows = client.flows.list()
```

### Get Connector

#### Node.js

```typescript
const connector = await client.connectors.get('<connector_id>');
```

#### Python

```python
connector = client.connectors.get("<connector_id>")
```

---

## Quick Reference Table

| Task | Node.js | Python |
|------|---------|--------|
| **Init client** | `new LoxtepClient(options)` | `LoxtepClient(**options)` |
| **Write events** | `await client.data_products.get_writer('name')` → `writer.write(evt)` → `writer.close()` | Same API |
| **Read events** | `await client.data_products.get_reader('name')` → `for await (const e of reader)` | Same API |
| **Write (low-level)** | `client.flows.get_writer(flow_id, { bot_id, output_queue_name })` | Same API |
| **Read (low-level)** | `client.queues.open_reader({ bot_id, queue_name })` → `reader.read()` | Same API |
| **Stream live** | `client.data_products.stream(id, opts)` | Same API |
| **Replay history** | `client.data_products.replay(id, opts)` | Same API |
| **List data products** | `client.data_products.list()` | Same API |
| **Get data product** | `client.data_products.get(id)` | Same API |
| **List flows** | `client.flows.list()` | Same API |
| **Get connector** | `client.connectors.get(id)` | Same API |
| **Invalidate cache** | `client.data_products.invalidate_cache('name')` | Same API |

---

## CLI Shortcuts

```bash
# Log in
npx loxtep login

# Initialize config
npx loxtep init

# Export connector config (shell, json, or env format)
npx loxtep config export --from-connector "<connector_id>" --format sh
npx loxtep config export --from-connector "<connector_id>" --format json
npx loxtep config export --from-connector "<connector_id>" --format env
```

---

## Auth Precedence

The SDK resolves authentication in this order:

1. `LOXTEP_AUTH_TOKEN` environment variable
2. `~/.loxtep/credentials.json` (from `loxtep login`)

---

## Further Reading

| Resource | Description |
|----------|-------------|
| [Getting Started Guide](./getting-started.md) | Zero-to-first-event walkthrough |
| [Event Replay Cookbook](./event-replay-cookbook.md) | Patterns for replaying historical events |
| [MCP → SDK Mapping](./sdk-mcp-mapping.md) | How MCP tools map to SDK methods |
