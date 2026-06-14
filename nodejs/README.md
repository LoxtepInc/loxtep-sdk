# Loxtep Node.js SDK

Client for the Loxtep API. Customer-facing surface: **data_products**,
**flows**, **connections**, **queues**, **quality**, **catalog**, **discovery**,
**schemas**, **projects**, **domains**, **standards**, **data_contracts**,
**workflows**, **templates**, **connectors**, **instances**, **delivery**,
**thesaurus**, **procedures**, **metrics**.

> **Note:** The `consumptions` namespace is deprecated. Use `delivery` instead.
> The `consumptions` namespace remains functional but logs a deprecation warning
> on first use and will be removed in a future major version.

**Node.js 22+** is the supported runtime (`engines` in `package.json`). **Live**
queue/flow writes use the **Loxtep stream** data plane; configure stream bus
resources (`streams` on `LoxtepClient` and instance env from your stack) and AWS
credentials for SigV4 on both REST and the bus.

## Quick start (< 5 min to first stream)

1. **Install**

   ```bash
   npm install @loxtep/sdk
   ```

2. **Log in**

   ```bash
   npx loxtep login
   ```

   A browser window opens — sign in to Loxtep and you're authenticated.
   Tokens are saved to `~/.loxtep/credentials.json` and refresh automatically.

   > **CI/headless:** Use `npx loxtep login --email you@co.com --password ...`
   > or set `LOXTEP_AUTH_TOKEN` in your environment.

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
   writer.write({ customer_id: '123', name: 'Alice', email: 'alice@example.com' });
   writer.write({ customer_id: '456', name: 'Bob', email: 'bob@example.com' });
   await writer.close();
   ```

   The `write()` method accepts your raw business object — the SDK handles
   batching and delivery to the stream bus automatically. No event envelope
   or metadata wrapper is needed.

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
- **consumptions** – ~~list, get, create, update, delete~~ (deprecated — use `delivery`)
- **delivery** – list, get, create, update, delete
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

- **`write(event)`** – enqueues a raw business object. Batching is transparent:
  you do not control batch size or flush timing.
- **`close()`** – flushes any buffered events and guarantees delivery (or
  attempts to). Always call `close()` when done writing.

Example:

```ts
const writer = client.flows.get_writer(flowId, { bot_id: 'your-bot-id' });
writer.write({ customer_id: '123', name: 'Alice', email: 'alice@example.com' });
writer.write({ customer_id: '456', name: 'Bob', email: 'bob@example.com' });
await writer.close();
```

Pass your raw business objects — no envelope, no `id`/`payload` wrapper needed.
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

## Delivery interfaces

Configure how a data product delivers data to external systems. The `delivery`
namespace is the primary interface (replaces the deprecated `consumptions`
namespace).

```ts
import { LoxtepClient } from '@loxtep/sdk';
import type { DeliveryInterface, DeliveryCreateInput } from '@loxtep/sdk';

const client = new LoxtepClient({
  api_url: 'https://api.loxtep.com',
  auth: { type: 'jwt', token: process.env.LOXTEP_AUTH_TOKEN! },
});

// List delivery interfaces for a data product
const { items, pagination } = await client.delivery.list('dp_abc123');

// Create a webhook delivery interface
const webhook = await client.delivery.create('dp_abc123', {
  deliveryType: 'webhook',
  name: 'Order notifications',
  endpoint_url: 'https://example.com/webhooks/orders',
  method: 'POST',
});

// Update a delivery interface
await client.delivery.update('dp_abc123', webhook.consumption_id, {
  is_active: false,
});

// Delete a delivery interface
await client.delivery.delete('dp_abc123', webhook.consumption_id);
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
| `login`                                              | Log in via browser OAuth (default) or email/password                |
| `login --browser`                                    | Explicitly use browser OAuth flow                                  |
| `login --email <e> --password <p>`                   | Headless login for CI (optional `--mfa-code`)                      |
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

## Module exports

The SDK also ships standalone modules for configuration, authentication,
code generation, skill scoping, and workflow authoring. Import them directly
from the relevant subpath.

### `config` module

```typescript
import { loadConfig, loadConfigSync, saveConfig } from '@loxtep/sdk/config';
```

| Export | Type | Description |
| --- | --- | --- |
| `loadConfig` | function | Load config from env vars and optional file (async). Precedence: env > file > defaults |
| `loadConfigSync` | function | Synchronous variant of `loadConfig` using `readFileSync` |
| `saveConfig` | function | Persist config (api_url, org/project/instance IDs) to file. No secrets written to disk |
| `parseStreamsPartial` | function | Extract a partial bus config from unknown JSON, keeping only valid stream resource keys |
| `getConfigDir` | function | Return the default config directory path (`~/.loxtep`) |
| `getDefaultConfigPath` | function | Return the default config file path (`~/.loxtep/config.json`) |
| `buildAuthServiceUrl` | function | Build the full URL for auth endpoints (`/auth/login`, `/auth/refresh`) with path prefix |
| `extendClientBaseUrl` | function | Extend `api_url` with a microservice path segment, avoiding duplication |
| `buildPlatformRequestUrl` | function | Build a full request URL for the shared control-plane host, handling microservice routing |
| `resolveAutoConfig` | function | Resolve configuration with full precedence: env > explicit > workspace files |

### `auth` module

```typescript
import { login, refresh, browserLogin, TokenManager } from '@loxtep/sdk/auth';
```

| Export | Type | Description |
| --- | --- | --- |
| `decodeJwtPayload` | function | Decode JWT payload to read `exp` (expiry) without verification. Client-side only |
| `login` | function | Authenticate with email/password via `POST /auth/login`. Returns access + refresh tokens |
| `refresh` | function | Refresh an access token via `POST /auth/refresh` |
| `browserLogin` | function | Run OAuth 2.1 browser-based login flow with a localhost callback server |
| `TokenManager` | class | In-memory token manager with auto-refresh support. No tokens persisted to disk |
| `LoginMfaRequiredError` | class | Error thrown when login returns 403 and the user must supply a TOTP code |

### `codegen` module

```typescript
import { loadWorkspaceContext, deriveKey, normalizeContext, emitArtifact, writeArtifact, computeCounts } from '@loxtep/sdk/codegen';
```

| Export | Type | Description |
| --- | --- | --- |
| `loadWorkspaceContext` | function | Fetch all workspace resources from the control plane and assemble a `WorkspaceContext` |
| `deriveKey` | function | Derive a deterministic, valid TypeScript identifier key from a resource name |
| `normalizeContext` | function | Transform raw `WorkspaceContext` into canonical `NormalizedContext` with stable keys and id-sorted ordering |
| `emitArtifact` | function | Render a `NormalizedContext` into a complete TypeScript source string with `as const` exports |
| `writeArtifact` | function | Atomic file write of the generated artifact; returns per-resource-type counts |
| `computeCounts` | function | Compute per-resource-type counts from a `NormalizedContext` |

### `skills` module

```typescript
import { checkScope, parseSkillYaml, loadSkillsFromDirectory } from '@loxtep/sdk/skills';
```

| Export | Type | Description |
| --- | --- | --- |
| `checkScope` | function | Fail-closed scope decision: check whether an operation on a resource is permitted by a skill |
| `checkScopeByName` | function | Resolve a skill by name from a map and check scope in one step |
| `parseSkillYaml` | function | Parse a YAML string into a validated `SkillDefinition` |
| `loadSkillFromFile` | function | Load a single skill definition from a `.yaml` file path |
| `loadSkillsFromDirectory` | function | Load all skill definitions from a `.loxtep/skills/` directory |
| `validateSkillReferences` | function | Validate all skill resource references against the loaded `WorkspaceContext` |
| `formatSkillValidationErrors` | function | Format skill validation errors into human-readable messages |
| `SkillDefinitionSchema` | object | Zod schema for validating skill definition YAML structure |

### `authoring` module

```typescript
import { defineDataWorkflow, on, createToolbox, agent } from '@loxtep/sdk/authoring';
```

| Export | Type | Description |
| --- | --- | --- |
| `defineDataWorkflow` | function | Validate and return a `DataWorkflowModule` spec. Throws `ValidationError` on invalid input |
| `on` | object | Trigger builders: `queueEvent`, `connectorEvent`, `schedule`, `webhook` |
| `createToolbox` | function | Create a deterministic typed platform-call toolbox (no model in the loop) |
| `agent` | function | Agentic operation entry point with scope enforcement and action trace |
| `validateAgentOptions` | function | Validate agent options (prompt length, skills references) against available skills |
| `computeReachableScope` | function | Compute the union of all resource scopes from supplied skill definitions |
| `enforceAgentScope` | function | Check whether a resource access is within the merged scope of the agent's skills |
| `createScopeGuardedToolbox` | function | Create a scope-guarded proxy that enforces scope and records traces before every call |
| `compileModule` | function | Pure compiler: lower a `DataWorkflowModule` into `GraphPatchOp[]` for deployment |
| `computeRemovalSet` | function | Compute workflows present on instance but absent from project modules (for cleanup) |
| `ActionTrace` | class | Mutable action trace recorder with monotonically increasing sequence numbers |
| `AgentScopeError` | class | Error thrown when an agentic operation is blocked due to a scope violation |
| `ToolboxOperationError` | class | Error thrown when a toolbox operation fails (network, validation, or platform error) |

### `http` module

```typescript
import { signRequest, LoxtepHttpClient } from '@loxtep/sdk/http';
```

| Export | Type | Description |
| --- | --- | --- |
| `signRequest` | function | Sign an HTTP request with AWS SigV4 for API Gateway (`execute-api`). Returns headers including `Authorization` and `x-amz-*` |
| `LoxtepHttpClient` | class | HTTP client that signs requests with AWS SigV4 and attaches JWT. Provides `get`, `post`, `put`, `delete` helpers with retry on 5xx/network errors and typed Loxtep errors on 4xx |

### `checkpoint` module

```typescript
import { createMemoryCheckpointStore } from '@loxtep/sdk/checkpoint';
```

| Export | Type | Description |
| --- | --- | --- |
| `createMemoryCheckpointStore` | function | Create an in-memory checkpoint store for stream/replay resume. Suitable for tests or single-process use |

### Error classes

```typescript
import { AuthorizationError, ConflictError, ValidationError, DefinitionValidationError, SchemaValidationError, CheckpointError, parseHttpError } from '@loxtep/sdk/errors';
```

| Export | Type | Description |
| --- | --- | --- |
| `AuthorizationError` | class | 403 — Insufficient permissions |
| `ConflictError` | class | 409 — Resource already exists or version conflict |
| `ValidationError` | class | 400 — Invalid input with optional `field_errors` array |
| `DefinitionValidationError` | class | 400 — Payload doesn't match data product definition (schema validation failures) |
| `SchemaValidationError` | class | Alias for `DefinitionValidationError` (backend terminology) |
| `CheckpointError` | class | 500 — Failed to save or load a stream checkpoint |
| `parseHttpError` | function | Map an HTTP status code and response body to the appropriate typed Loxtep error class |

### `DataProductResolver` class

```typescript
import { DataProductResolver } from '@loxtep/sdk/client';
```

| Export | Type | Description |
| --- | --- | --- |
| `DataProductResolver` | class | Resolves a data product name or UUID into full runtime configuration (queue name, bot_id, stream bus resources). Caches results in memory. Used internally by `client.data_products.get_writer`/`get_reader` |
