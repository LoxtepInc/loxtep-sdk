# Loxtep Node.js SDK

Client for the Loxtep API. Customer-facing surface: **data_products**,
**flows**, **connections**, **queues**, **quality**, **catalog**, **discovery**,
**schemas**, **projects**, **domains**, **standards**, **data_contracts**,
**workflows**, **templates**, **connectors**, **instances**, **consumptions**,
**thesaurus**, **procedures**, **metrics**.

**Node.js 22+** is the supported runtime (`engines` in `package.json`). **Live**
queue/flow writes use the **Loxtep stream** data plane; configure stream bus
resources (`streams` on `LoxtepClient` and instance env from your stack) and AWS
credentials for SigV4 on both REST and the bus.

## Quick start (< 5 min to first stream)

1. **Install**

   ```bash
   npm install @loxtep/sdk
   ```

2. **Configure and log in**

   ```bash
   npx loxtep config set api_url https://api.loxtep.com
   npx loxtep login
   ```

   Tokens resolve in this order: **`LOXTEP_AUTH_TOKEN`** →
   **`~/.loxtep/credentials.json`** (shared with
   `npx @loxtep/customer-mcp-server login`).

3. **Create a client, write and read events**

   ```ts
   import { LoxtepClient } from '@loxtep/sdk';

   const client = new LoxtepClient({
     api_url: 'https://api.loxtep.com',
     auth: { type: 'jwt', token: process.env.LOXTEP_AUTH_TOKEN! },
   });

   // Write events to a data product
   const writer = await client.data_products.get_writer('shopify_gql_customer');
   writer.write({
     customer_id: '123',
     name: 'Alice',
     email: 'alice@example.com',
   });
   await writer.close();

   // Read events from a data product
   const reader = await client.data_products.get_reader('shopify_gql_customer');
   for await (const event of reader) {
     console.log(event);
   }
   ```

   That's it. The SDK resolves the data product's queue, bot identity, and
   stream bus configuration automatically from the deployment metadata. No
   manual queue names, no stream config, no bot IDs.

4. **Lower-level escape hatch** — if you need explicit control over bot_id,
   queue name, or stream bus resources, use `flows.get_writer` directly:

   ```ts
   const writer = client.flows.get_writer('your-flow-id', {
     bot_id: 'your-bot-id',
     output_queue_name: 'your-ingest-queue',
   });
   writer.write({ id: 'e1', payload: { name: 'Alice' } });
   await writer.close();
   ```

5. **Stream config from the platform (optional)** — after login,
   `await client.observe.stream_config()` returns stream resource names
   needed for the data plane. Merge into
   `new LoxtepClient({ ...opts, streams: { ...partial } })` with your
   JWT-backed client. Note: `data_products.get_writer` and `get_reader` resolve
   stream config automatically — this is only needed for manual bus access.

## API surface

- **data_products** – get, get_lexicon, list, search, query, list_tables,
  get_queue_info, get_reader_checkpoint, create, stream, replay,
  **get_writer**, **get_reader**, invalidate_cache
- **flows** – list, get, create, get_writer
- **workflows** – listWorkflows, getWorkflowGraph, createWorkflow, deploy
- **connections** – get, list, create, update, delete, test
- **connectors** – list, get, create, update, delete, test, getOauthUrl
- **queues** – get_queue_metadata, get_reader_checkpoint, open_reader,
  open_writer
- **quality** – list, get, create
- **catalog** – search
- **discovery** – search, getEvidence, getLineageImpact, getGovernanceFlags,
  runDiscovery
- **schemas** – get, list
- **observe** – status, stream_config
- **projects** – list, get, create, update, delete, applyTemplate
- **templates** – list, get
- **domains** – list, get
- **standards** – list, get
- **data_contracts** – list, get
- **thesaurus** – listTerms, resolveCanonicalKey
- **consumptions** – list, get, create, update, delete
- **instances** – list, get, get_stream_config
- **procedures** – list
- **metrics** – log, get_reporter

## Data product writer and reader

`await client.data_products.get_writer('name')` resolves the data product's
queue, bot identity, and stream bus config automatically, then returns a
**FlowWriter**:

```ts
const writer = await client.data_products.get_writer('shopify_gql_customer');
writer.write({ customer_id: '123', name: 'Alice', email: 'alice@example.com' });
await writer.close();
```

`await client.data_products.get_reader('name')` returns an async iterable over
the data product's queue:

```ts
const reader = await client.data_products.get_reader('shopify_gql_customer');
for await (const event of reader) {
  console.log(event);
}
```

Options:

- **Writer**: `{ bot_id?, batch_size?, max_retries? }`
- **Reader**: `{ bot_id?, from?, batch_size? }`

Cache: call `client.data_products.invalidate_cache('name')` to force
re-resolution on the next call.

## Flow writer (lower-level escape hatch)

`client.flows.get_writer(flow_id)` returns a **FlowWriter** with:

- **`write(event)`** – enqueues an event. Batching is transparent: you do not
  control batch size or flush timing.
- **`close()`** – flushes any buffered events and guarantees delivery (or
  attempts to). Always call `close()` when done writing.

Example:

```ts
const writer = client.flows.get_writer(flowId, { bot_id: 'your-bot-id' });
writer.write({ id: 'e1', payload: { name: 'Alice' } });
writer.write({ id: 'e2', payload: { name: 'Bob' } });
await writer.close();
```

Buffered events flush on `close()` via the stream data plane to the resolved
output queue.

## Stream helpers

Use `mapStream` and `filterStream` with `data_products.stream()`,
`data_products.replay()`, or `queues.open_reader().read()`:

```ts
import { mapStream, filterStream } from '@loxtep/sdk';

for await (const event of mapStream(reader.read(), e => e.payload)) {
  console.log(event);
}
for await (const event of filterStream(
  reader.read(),
  e => e.event_id !== 'skip'
)) {
  console.log(event);
}
```

## Documentation

- **Getting started** – Zero to first event in under 5 minutes.
- **Quick reference** – Single-page cheat sheet.
- **Event replay cookbook** – Replay events from a data product or queue.
- **MCP + SDK pairing** – One auth story, when MCP vs SDK.
- **MCP → SDK mapping** – Agent-oriented table.
- **Typed errors** – `import { … } from '@loxtep/sdk/errors'`.
- **API reference** – `npm run docs` (Typedoc).

## CLI reference

| Command                                              | Description                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `login`                                              | Log in with email/password (prompts if not provided)               |
| `login --browser`                                    | Log in via browser OAuth flow                                      |
| `logout`                                             | Remove stored credentials                                          |
| `whoami`                                             | Print current user and organization                                |
| `init`                                               | Setup checklist + doc pointers                                     |
| `config list`                                        | Show api_url, organization_id, project_id, instance_id             |
| `config paths`                                       | Show resolved URLs for auth and SDK path matrix                    |
| `config set <key> <value>`                           | Set api_url \| organization_id \| project_id \| instance_id        |
| `config export --from-data-product <id>`             | Print shell exports / JSON for SDK bootstrap                       |
| `config export --from-connector <id>`                | Print env exports from SDK connector                               |
| `bus login`                                          | Explain bus vs JWT (placeholder for future session API)            |
| `data-products list`                                 | List data products                                                 |
| `data-products get <id>`                             | Get data product by id                                             |
| `data-products create --name … --domain-id …`        | Create data product                                                |
| `data-products query <id> <SQL>`                     | Run SQL in data product context (or `--file query.sql`)            |
| `data-products tables <id>`                          | List tables for data product                                       |
| `flows list [--project-id <id>]`                     | List flows (project_id required or from config)                    |
| `flows get <id>`                                     | Get flow by id (with nodes)                                        |
| `flows create --name <n> --project-id <id>`          | Create flow (optional: `--template-id`, `--description`)           |
| `workflows list [--project-id <id>]`                 | List workflows                                                     |
| `workflows deploy --project-id <id>`                 | Deploy workflow (optional: `--instance-id`, `--version-id`)        |
| `connections list`                                   | List connections                                                   |
| `connections get <id>`                               | Get connection by id                                               |
| `connections create --name <n> --type <t> --key <k>` | Create connection                                                  |
| `connections test <id>`                              | Test connection                                                    |
| `observe status`                                     | Show observability status (bots)                                   |
| `queue info <data-product-id>`                       | Queue info by data product id                                      |
| `queue info --queue <name>`                          | Queue info by queue name                                           |
| `queue checkpoint <id> --bot <bot-id>`               | Reader checkpoint for data product and bot                         |
| `domains list` \| `domains get <id>`                 | List or get domain                                                 |
| `standards list` \| `standards get <id>`             | List or get standard (policy)                                      |
| `data-contracts list` \| `data-contracts get <id>`   | List or get data contract                                          |
| `metrics rate-limits`                                | Show rate limit info                                               |
| `metrics log --id <id> --value <n>`                  | Log metric (optional `--tags k=v,...`)                             |

Examples:

```bash
loxtep login
loxtep whoami
loxtep data-products list
loxtep flows list --project-id <project-id>
loxtep flows get <flow-id>
loxtep workflows list --project-id <project-id>
loxtep workflows deploy --project-id <id> --instance-id <id>
loxtep config export --from-connector <connector-id> --format json
loxtep queue info <data-product-id>
loxtep data-products query <data-product-id> "SELECT * FROM t LIMIT 10"
loxtep metrics rate-limits
```
