# SDK Quick Reference Card

Concise cheat sheet for common Loxtep SDK operations (Node.js **v0.7+** MCP
facades). For full walkthroughs, see the [Getting Started Guide](./getting-started.md).

---

## Client Initialization

### Node.js

```typescript
import { LoxtepClient } from '@loxtep/sdk';

const client = new LoxtepClient({
  api_url: process.env.LOXTEP_API_URL,
  auth: { type: 'jwt', token: process.env.LOXTEP_AUTH_TOKEN! },
  organization_id: process.env.LOXTEP_ORGANIZATION_ID,
  project_id: process.env.LOXTEP_PROJECT_ID,
  instance_id: process.env.LOXTEP_INSTANCE_ID,
  region: process.env.LOXTEP_REGION,
});

// Or from workspace files after `loxtep init` + `loxtep login`:
const wsClient = LoxtepClient.fromWorkspace();
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

---

## Writing Events

**Recommended: `client.get_writer('name')`** — resolves queue, bot_id, and stream
bus config from deployment metadata.

### Node.js

```typescript
const writer = await client.get_writer('my-data-product');

writer.write({ id: 'evt-1', payload: { key: 'value' } });
writer.write({ id: 'evt-2', payload: { key: 'value' } });

await writer.close(); // flushes all buffered events
```

### Python

```python
writer = await client.get_writer("my-data-product")

writer.write({"id": "evt-1", "payload": {"key": "value"}})
writer.write({"id": "evt-2", "payload": {"key": "value"}})

await writer.close()  # flushes all buffered events
```

---

## Reading Events

**Recommended: `client.get_reader('name')`**

### Node.js

```typescript
const reader = await client.get_reader('my-data-product');

for await (const event of reader) {
  console.log(event);
}
```

### Python

```python
reader = await client.get_reader("my-data-product")

for event in reader:
    print(event)
```

### Advanced: manual queue reader (`client.observe`)

```typescript
const reader = await client.observe.open_reader({
  bot_id: 'my-reader',
  queue_name: 'raw-events',
});
for await (const event of reader.read()) {
  console.log(event);
}
reader.close();
```

---

## Data Products (CRUD / stream / replay)

Under **`client.build.data_products`** for control-plane APIs; top-level
`get_writer` / `get_reader` for live I/O.

### Stream Live Events

#### Node.js

```typescript
const stream = await client.build.data_products.stream('<data_product_id>', {
  bot_id: 'my-stream-bot',
});

for await (const event of stream) {
  console.log(event);
}
```

### Replay Historical Events

```typescript
for await (const event of client.build.data_products.replay('<data_product_id>', {
  start: '2024-01-01T00:00:00Z',
  end: '2024-01-02T00:00:00Z',
})) {
  console.log(event);
}
```

### List and Get

```typescript
const products = await client.build.data_products.list();
const product = await client.build.data_products.get('<data_product_id>');
```

---

## Workflows and Connectors

```typescript
const workflows = await client.build.workflows.list({ project_id: '<project_id>' });
const connector = await client.connect.connectors.get('<connector_id>');
const hits = await client.query.catalog.search({ query: 'orders' });
```

---

## Quick Reference Table

| Task | Node.js (v0.7+) |
|------|-----------------|
| **Init client** | `new LoxtepClient(options)` or `LoxtepClient.fromWorkspace()` |
| **Write events** | `await client.get_writer('name')` → `writer.write(evt)` → `writer.close()` |
| **Read events** | `await client.get_reader('name')` → `for await (const e of reader)` |
| **Read (low-level)** | `client.observe.open_reader({ bot_id, queue_name })` |
| **Stream live** | `client.build.data_products.stream(id, opts)` |
| **Replay history** | `client.build.data_products.replay(id, opts)` |
| **List data products** | `client.build.data_products.list()` |
| **List workflows** | `client.build.workflows.list({ project_id })` |
| **Get connector** | `client.connect.connectors.get(id)` |
| **Catalog search** | `client.query.catalog.search({ query })` |
| **Invalidate cache** | `client.build.data_products.invalidate_cache('name')` |

See [MCP → SDK mapping](./sdk-mcp-mapping.md) for all 10 facades.

---

## CLI Shortcuts

```bash
npx loxtep login
npx loxtep init
npx loxtep config export --from-connector "<connector_id>" --format json
```

---

## Auth Precedence

CLI and `fromWorkspace()` resolve tokens in this order:

1. `LOXTEP_AUTH_TOKEN` (CLI) / `LOXTEP_TOKEN` (auto-config env)
2. Project-local `.loxtep/credentials.json`
3. `~/.loxtep/credentials.json` (from `loxtep login`)

Pass `auth: { type: 'jwt', token }` explicitly when constructing `LoxtepClient`
in application code.

---

## Further Reading

| Resource | Description |
|----------|-------------|
| [Getting Started Guide](./getting-started.md) | Zero-to-first-event walkthrough |
| [Event Replay Cookbook](./event-replay-cookbook.md) | Replay patterns (`build.data_products`, `observe`) |
| [MCP → SDK Mapping](./sdk-mcp-mapping.md) | How MCP tools map to SDK methods |
