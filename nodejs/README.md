# Loxtep Node.js SDK

Client for the Loxtep API. Since **v0.7.0**, `LoxtepClient` groups APIs under
**namespaced areas** on the client (no flat top-level namespaces like
`client.workflows` or `client.data_products`).

| Area | SDK namespace | Examples |
| --- | --- | --- |
| Authentication | `client.session` | `get_current_user()` |
| Connect | `client.connect` | `.connectors.*`, `.templates.*` |
| Workspace | `client.workspace` | `.projects.*`, `.instances.*` |
| Build & deploy | `client.build` | `.workflows.*`, `.triggers.*`, `.data_products.*`, `.targets.*` |
| Governance | `client.define` | `.schemas.*`, `.quality.*`, `.domains.*`, … |
| Semantics | `client.meaning` | `.thesaurus.*` |
| Review | `client.review` | `.approvals.*`, `.improvements.*` |
| Analytics | `client.query` | `.catalog.*`, `.discovery.*`, `.query()` |
| Observe | `client.observe` | `.stream_config()`, `.open_reader()` |
| Context | `client.context` | `.procedures.*`, `.activity.*`, … |

**Stream I/O** uses top-level helpers on the client:
`await client.get_writer('data-product-name')` and
`await client.get_reader('data-product-name')`.

**Upgrading from 0.6.x:** replace `client.data_products` →
`client.build.data_products` (CRUD/stream/replay) or `client.get_writer` /
`client.get_reader` (recommended write/read path); `client.workflows` →
`client.build.workflows`; etc.

**Node.js 22+** is the supported runtime (`engines` in `package.json`). **Live**
queue/flow writes use the **Loxtep stream** data plane; configure stream bus
resources (`streams` on `LoxtepClient` and instance env from your stack) and AWS
credentials for SigV4 on both REST and the bus.

## Ways to get started

This SDK supports two developer workflows:

| Path | Use case | Entry point |
|------|----------|-------------|
| **Programmatic** | Write/read events from application code (microservices, lambdas, scripts) | `LoxtepClient` → `get_writer` / `get_reader` |
| **Code-first CLI** | Author workflows as TypeScript, test locally, deploy via CI | `loxtep init → attach → generate → test → deploy` |

There are also two additional paths that don't require this SDK:
- **Agent-first (MCP)** — drive Loxtep conversationally from Cursor, Kiro, Claude, etc. See [loxtep-plugins-skills](https://github.com/LoxtepInc/loxtep-plugins-skills).
- **Web UI** — visual project setup and management at [app.loxtep.io](https://app.loxtep.io).

All paths are documented in the [Loxtep Quickstart](https://docs.loxtep.io/quickstart).

---

## Quick start — Programmatic (< 5 min to first stream)

1. **Install**

   ```bash
   pnpm add @loxtep/sdk
   ```

2. **Log in**

   ```bash
   pnpm exec loxtep login
   ```

   A browser window opens — sign in to Loxtep and you're authenticated.
   Tokens are saved to `./.loxtep/credentials.json` (use `--global` for home dir).

   > **CI/headless:** Use `pnpm exec loxtep login --email you@co.com --password ...`
   > or set `LOXTEP_AUTH_TOKEN` in your environment.

3. **Create a client, write and read events**

   ```ts
   import { LoxtepClient } from '@loxtep/sdk';

   const client = new LoxtepClient({
     api_url: 'https://api.loxtep.com',
     auth: { type: 'jwt', token: process.env.LOXTEP_AUTH_TOKEN! },
   });

   // Write events to a data product (top-level — resolves deployment metadata)
   const writer = await client.get_writer('shopify_gql_customer');
   writer.write({
     customer_id: '123',
     name: 'Alice',
     email: 'alice@example.com',
   });
   await writer.close();

   // Read events from a data product
   const reader = await client.get_reader('shopify_gql_customer');
   for await (const event of reader) {
     console.log(event);
   }
   ```

   That's it. The SDK resolves the data product's queue, bot identity, and
   stream bus configuration automatically from the deployment metadata. No
   manual queue names, no stream config, no bot IDs.

4. **Stream config from the platform (optional)** — after login,
   `await client.observe.stream_config()` returns stream resource names
   needed for the data plane. Merge into
   `new LoxtepClient({ ...opts, streams: { ...partial } })` with your
   JWT-backed client. `get_writer` / `get_reader` resolve stream config
   automatically — this step is only needed for manual bus access via
   `client.observe.open_reader()`.

---

## Quick start — Code-first CLI (init → deploy)

For developers who author workflows as TypeScript and want the full local-dev-to-production lifecycle, see the dedicated **[Code-first CLI guide](./docs/code-first-cli.md)**. Quick version:

```bash
# 1. Install
pnpm add @loxtep/sdk

# 2. Authenticate
pnpm exec loxtep login

# 3. Scaffold a project from a template
pnpm exec loxtep init --template shopify-orders

# 4. Bind to a runtime instance
pnpm exec loxtep attach --instance prod

# 5. Generate typed workspace constants
pnpm exec loxtep generate

# 6. Author a workflow (see authoring module docs below)

# 7. Test locally with a sample event
pnpm exec loxtep test orders-enricher --event ./events/order-created.json

# 8. Deploy to the workflow engine
pnpm exec loxtep deploy
```

The `generate` step produces `.loxtep/generated/index.ts` with typed constants for every data product, connector, domain, and queue in your workspace. Import them in your workflow modules for compile-time safety:

```ts
import { defineDataWorkflow, on } from '@loxtep/sdk'
import { workspace } from './.loxtep/generated'

export default defineDataWorkflow({
  name: 'orders-enricher',
  triggers: [on.queueEvent(workspace.queues.orders_raw)],
  async handler(ctx, event) {
    await ctx.toolbox.dataProducts.upsert({
      dataProduct: workspace.dataProducts.orders_enriched,
      domain: workspace.domains.commerce,
      record: event,
    })
  },
})
```

See `loxtep init --help`, `loxtep attach --help`, etc. for all flags. The full CLI reference is in the [CLI reference](#cli-reference) section below.

---

## API surface

Every method is `snake_case`. APIs live on **namespaced areas** of
`LoxtepClient` (see table at the top). Nested APIs use descriptive names
(`workflows`, `data_products`, `connectors`, …) under each area.

### Top-level stream I/O (preferred)

- **`get_writer(name_or_id)`** — write path; resolves queue, bot, stream config
- **`get_reader(name_or_id)`** — async iterable read path
- **`LoxtepClient.fromWorkspace()`** — construct from `.loxtep/project.json` +
  `./.loxtep/credentials.json` (env overrides: `LOXTEP_API_URL`, `LOXTEP_TOKEN`, …)

### Build & deploy (`client.build`)

- **`.workflows`** — `list`, `get`, `create`, `get_graph`, `deploy`; low-level
  `.get_writer(workflow_id, { bot_id, … })` escape hatch
- **`.triggers`** — `get`, `list`, `create`, `update`, `delete`, `test`
- **`.data_products`** — CRUD, `stream`, `replay`, `get_queue_info`,
  `invalidate_cache`, … (for writes/reads by name, prefer top-level
  `client.get_writer` / `get_reader`)
- **`.targets`** — delivery sink bindings (`list`, `get`, `create`, `update`, `delete`)

### Connect (`client.connect`)

- **`.connectors`** — org-level connector credentials
- **`.templates`** — starter templates (`list`, `get`, `apply_template` on projects)

### Workspace (`client.workspace`)

- **`.projects`** — `list`, `get`, `create`, `update`, `delete`, `apply_template`
- **`.instances`** — `list`, `get`, stream config helpers

### Governance (`client.define`)

- **`.schemas`**, **`.quality`**, **`.standards`**, **`.data_contracts`**, **`.domains`**

### Analytics (`client.query`)

- **`.catalog`**, **`.discovery`**, **`.query()`**, **`.list_tables()`**, **`.search()`**

### Observe (`client.observe`)

- **`status()`**, **`stream_config()`**, **`open_reader()`**, **`open_writer()`**,
  **`get_queue_metadata()`**, **`get_reader_checkpoint()`**

### Authentication, semantics, review, and context

- **`client.session`** — `get_current_user`, `get_current_organization`, `logout`
- **`client.meaning`** — `.thesaurus.*`
- **`client.review`** — `.approvals.*`, `.improvements.*`
- **`client.context`** — `.procedures.*`, `.activity.*`, `.process_intelligence.*`
- **`client.metrics`** — `log`, `get_reporter` (stub until metrics wiring lands)

## Data product writer and reader

`await client.get_writer('name')` resolves the data product's queue, bot
identity, and stream bus config automatically, then returns a **FlowWriter**:

```ts
const writer = await client.get_writer('shopify_gql_customer');
writer.write({ customer_id: '123', name: 'Alice', email: 'alice@example.com' });
await writer.close();
```

`await client.get_reader('name')` returns an async iterable over the data
product's queue:

```ts
const reader = await client.get_reader('shopify_gql_customer');
for await (const event of reader) {
  console.log(event);
}
```

Options:

- **Writer**: `{ bot_id?, batch_size?, max_retries? }`
- **Reader**: `{ bot_id?, from?, batch_size? }`

Cache: call `client.build.data_products.invalidate_cache('name')` to force
re-resolution on the next call.

## Stream helpers

Use `mapStream` and `filterStream` with `client.build.data_products.stream()`,
`client.build.data_products.replay()`, or `client.observe.open_reader().read()`:

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

## Targets (delivery)

Configure how a data product delivers data to external systems.

```ts
import { LoxtepClient } from '@loxtep/sdk';
import type { Target, TargetCreateInput } from '@loxtep/sdk';

const client = new LoxtepClient({
  api_url: 'https://api.loxtep.com',
  auth: { type: 'jwt', token: process.env.LOXTEP_AUTH_TOKEN! },
});

// List targets for a data product
const { items, pagination } = await client.build.targets.list('dp_abc123');

// Create a webhook target
const webhook = await client.build.targets.create('dp_abc123', {
  targetType: 'webhook',
  name: 'Order notifications',
  endpoint_url: 'https://example.com/webhooks/orders',
  method: 'POST',
});

// Update a target
await client.build.targets.update('dp_abc123', webhook.consumption_id, {
  is_active: false,
});

// Delete a target
await client.build.targets.delete('dp_abc123', webhook.consumption_id);
```

## Documentation

- **[Getting started](./docs/getting-started.md)** – Zero to first event in under 5 minutes (programmatic; no init).
- **[Code-first CLI](./docs/code-first-cli.md)** – `loxtep init`, attach, generate, test, deploy.
- **[Quick reference](./docs/quick-reference.md)** – Single-page cheat sheet.
- **[Event replay cookbook](./docs/event-replay-cookbook.md)** – Replay events from a data product or queue.
- **[SDK + agent pairing](./docs/sdk-pairing.md)** – When to use the SDK vs IDE agent integrations.
- **Typed errors** – `import { … } from '@loxtep/sdk/errors'`.
- **API reference** – `pnpm run docs` (Typedoc).

## CLI reference

| Command                                              | Description                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `login`                                              | Log in via browser OAuth (default) or email/password                |
| `login --browser`                                    | Explicitly use browser OAuth flow                                  |
| `login --email <e> --password <p>`                   | Headless login for CI (optional `--mfa-code`)                      |
| `logout`                                             | Remove stored credentials                                          |
| `whoami`                                             | Print current user and organization                                |
| `init [--template <slug>]`                           | Scaffold project structure, AGENTS.md, and default skill            |
| `init --create-repo [name]`                          | Scaffold + create a new GitHub repo (private default)              |
| `init --from-repo <url>`                             | Scaffold + import from an existing repo                            |
| `attach --instance <name-or-id>`                     | Bind project to a runtime instance                                 |
| `generate`                                           | Codegen typed workspace constants to `.loxtep/generated/index.ts`  |
| `test <module> --event <file>`                       | Run a workflow module locally with sample event(s)                  |
| `deploy`                                             | Compile modules, validate resources, deploy to workflow engine      |
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
| `workflows list [--project-id <id>]`                 | List workflows (project_id required or from config)                |
| `workflows get <id>`                                 | Get workflow by id (with nodes)                                    |
| `workflows create --name <n> --project-id <id>`      | Create workflow (optional: `--template-id`, `--description`)       |
| `workflows deploy --project-id <id>`                 | Deploy workflow (optional: `--instance-id`, `--version-id`)        |
| `triggers list`                                      | List triggers (ingest source bindings)                             |
| `triggers get <id>`                                  | Get trigger by id                                                 |
| `triggers create --name <n> --type <t> --key <k>`    | Create trigger                                                    |
| `triggers test <id>`                                 | Test trigger                                                      |
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
loxtep workflows list --project-id <project-id>
loxtep workflows get <workflow-id>
loxtep workflows deploy --project-id <id> --instance-id <id>
loxtep config export --from-connector <connector-id> --format json
loxtep queue info <data-product-id>
loxtep data-products query <data-product-id> "SELECT * FROM t LIMIT 10"
loxtep metrics rate-limits
```

## Module exports

The SDK re-exports configuration, authentication, codegen, skill scoping,
workflow authoring, HTTP, checkpoint, and streaming helpers from the main
entry point. **`@loxtep/sdk/errors`** is the only additional published
subpath (see `package.json` `exports`).

```typescript
import {
  LoxtepClient,
  loadConfig,
  login,
  defineDataWorkflow,
  on,
  checkScope,
  signRequest,
  createMemoryCheckpointStore,
  DataProductResolver,
} from '@loxtep/sdk';

import { ValidationError, parseHttpError } from '@loxtep/sdk/errors';
```

### Selected exports (import from `@loxtep/sdk` unless noted)

**Config:** `loadConfig`, `loadConfigSync`, `saveConfig`, `parseStreamsPartial`,
`getConfigDir`, `getDefaultConfigPath`, `buildAuthServiceUrl`,
`buildPlatformRequestUrl`, `resolveAutoConfig`

**Auth:** `decodeJwtPayload`, `login`, `refresh`, `browserLogin`, `TokenManager`,
`LoginMfaRequiredError`

**Codegen:** `loadWorkspaceContext`, `deriveKey`, `normalizeContext`, `emitArtifact`,
`writeArtifact`, `computeCounts`

**Skills:** `checkScope`, `checkScopeByName`, `parseSkillYaml`, `loadSkillFromFile`,
`loadSkillsFromDirectory`, `validateSkillReferences`, `formatSkillValidationErrors`,
`SkillDefinitionSchema`

**Authoring:** `defineDataWorkflow`, `on`, `createToolbox`, `agent`,
`validateAgentOptions`, `compileModule`, `ActionTrace`, `AgentScopeError`,
`ToolboxOperationError`

**HTTP:** `signRequest`, `LoxtepHttpClient`

**Checkpoint:** `createMemoryCheckpointStore`

**Streaming:** `mapStream`, `filterStream`

**Errors** (from `@loxtep/sdk/errors`): `AuthorizationError`, `ConflictError`,
`ValidationError`, `DefinitionValidationError`, `SchemaValidationError`,
`CheckpointError`, `parseHttpError`

**Resolver:** `DataProductResolver`, `AmbiguityError` — used internally by
`get_writer` / `get_reader`; import when building custom resolution logic.
