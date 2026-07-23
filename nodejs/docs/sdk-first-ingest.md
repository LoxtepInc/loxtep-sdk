# SDK-first ingest — your first data product and `get_writer`

You logged in, ran `init`, and `attach`. This guide takes you from there to
**writing events from application code** with `client.get_writer(name)`.

That is the primary greenfield path when you are **not** wiring a SaaS connector
first — you want your app (or ETL job) to push events into a **source** data
product on your attached instance.

> **Full CLI workspace setup:** [Getting Started](./getting-started.md) steps 1–4.
> **Code-first workflow modules:** [Code-first CLI](./code-first-cli.md).

---

## What you are building

```text
Your app  ──get_writer──▶  rstreams queue  ──▶  source data product (catalog)
     ▲                           ▲
     │                           │
  @loxtep/sdk              provisioned at deploy time
  fromWorkspace()
```

`get_writer` resolves **queue**, **bot**, and **stream bus** config from
**deployment metadata** (`deployment_bindings` on the data product). A catalog
row alone is not enough — the ingestion workflow must be **saved and deployed**
on your attached instance first.

---

## Prerequisites

Run from your scaffolded workspace (directory with `.loxtep/project.json`):

```bash
pnpm exec loxtep config list   # project_id + instance_id should be set
pnpm exec loxtep domains list  # you need a domain_id for the data product
```

Every org has at least one domain. Copy a `domain_id` from the list.

---

## Overview (four phases)

| Phase | What | How |
| ----- | ---- | --- |
| 1 | Workspace ready | `login` → `init` → `attach` (done) |
| 2 | Provision runtime | SDK connector + workflow bundle + deploy |
| 3 | Verify | `data-products list` / `data-products get` |
| 4 | Write events | `LoxtepClient.fromWorkspace()` + `get_writer` |

Phases 2–4 below.

---

## Phase 2 — Provision runtime (required before `get_writer`)

Runtime provisioning creates the workflow graph (SDK connection node → source
data product node), saves it to your project workspace, and **deploys** it to your
instance so queues and bots exist.

### Option A — CLI one-shot (recommended, no MCP)

From your workspace root (after `login`, `init`, `attach`):

```bash
pnpm exec loxtep ingest provision --name app-events
```

This command:

1. Creates an org-level **SDK connector** (`connector_type: "sdk"`).
2. Builds and saves the workflow bundle (`workflow.json` + connection + source data product).
3. **Deploys** to your attached instance (unless you pass `--no-deploy` or `--dry-run`).

Validate first without writing:

```bash
pnpm exec loxtep ingest provision --name app-events --dry-run
```

### Option B — Helper script + bundle save

Generate bundle JSON only:

```bash
node node_modules/@loxtep/sdk/docs/examples/generate-ingest-bundle.mjs
```

Then persist and deploy via CLI:

```bash
pnpm exec loxtep bundle save --dry-run --file .loxtep/sdk-ingest-bundle.json
pnpm exec loxtep bundle save --file .loxtep/sdk-ingest-bundle.json
pnpm exec loxtep workflows deploy \
  --project-id <project-id-from-config-list> \
  --instance-id <instance-id-from-config-list>
```

Or set `LOXTEP_AUTO_SAVE=1` on the helper script to save + deploy in one step.

Poll until deployment completes (Web UI **Observe**, or `loxtep observe status`).

### Option C — Loxtep MCP (Cursor / agent)

Use **`loxtep_build`** → `save_workflow_bundle` if you prefer MCP authoring.
Same bundle shape as below; deploy with `loxtep workflows deploy` or MCP
`deploy_project`.

### Option D — Web UI (Studio)

Create an **ingestion** workflow with an **SDK** connection node and a **source**
data product node, then deploy to your attached instance from the Studio deploy
flow.

---

### Workflow bundle shape

Minimal ingestion bundle (SDK connection → source data product). Replace UUIDs
and names; `connector_id` must be the SDK connector from step 2A or 2B.

```json
{
  "workflow.json": {
    "workflow_id": "<workflow-uuid>",
    "organization_id": "<org-uuid>",
    "project_id": "<project-uuid>",
    "name": "SDK App Events Ingest",
    "workflow_type": "ingestion",
    "domain_id": "<domain-uuid>",
    "status": "active",
    "configuration": {},
    "metadata": {},
    "created_at": "2026-07-23T00:00:00.000Z",
    "updated_at": "2026-07-23T00:00:00.000Z"
  },
  "connections/<connection-uuid>.json": {
    "connection_id": "<connection-uuid>",
    "organization_id": "<org-uuid>",
    "project_id": "<project-uuid>",
    "workflow_id": "<workflow-uuid>",
    "connector_id": "<sdk-connector-uuid>",
    "key": "sdk-input",
    "name": "SDK Input",
    "type": "sdk",
    "status": "active",
    "configuration": {
      "sdk_type": "nodejs",
      "event_type": "app-events"
    },
    "created_at": "2026-07-23T00:00:00.000Z",
    "updated_at": "2026-07-23T00:00:00.000Z"
  },
  "data-products/<data-product-uuid>.json": {
    "data_product_id": "<data-product-uuid>",
    "organization_id": "<org-uuid>",
    "project_id": "<project-uuid>",
    "workflow_id": "<workflow-uuid>",
    "upstream_entity_id": "<connection-uuid>",
    "upstream_entity_type": "connections",
    "domain_id": "<domain-uuid>",
    "name": "app-events",
    "kind": "source",
    "status": "draft",
    "owner": {},
    "governance": {
      "classification": "internal",
      "pii_fields": [],
      "compliance_requirements": [],
      "tags": []
    },
    "metadata": {},
    "created_at": "2026-07-23T00:00:00.000Z",
    "updated_at": "2026-07-23T00:00:00.000Z"
  }
}
```

The **`name`** on the data product node (`app-events` above) is what you pass
to `get_writer('app-events')`.

---

### Do not stop at `data-products create`

```bash
# Creates a catalog row only — get_writer will fail with "not deployed"
pnpm exec loxtep data-products create --name app-events --domain-id <uuid> --kind source
```

Use **`data-products create`** only when you already have (or will immediately
add) a deployed workflow that sets `deployment_bindings`. For greenfield SDK
ingest, prefer the bundle + deploy path above.

---

## Phase 3 — Verify deployment

```bash
pnpm exec loxtep data-products list
pnpm exec loxtep data-products get <data-product-id>
```

A deployable source data product includes **`deployment_bindings`** with
`queue_name`, `bot_id`, and `instance_id`. If those are missing, finish Phase 2
before writing.

Re-run code generation after platform changes:

```bash
pnpm exec loxtep generate
```

---

## Phase 4 — Write events from your app

Copy or run the example:

```bash
node node_modules/@loxtep/sdk/docs/examples/write-events.mjs
```

Or embed in your service:

```typescript
import { LoxtepClient } from '@loxtep/sdk';

const client = await LoxtepClient.fromWorkspace();

// Name from Phase 2 bundle / data-products list (case-sensitive)
const writer = await client.get_writer('app-events');

writer.write({
  event_id: 'evt_001',
  occurred_at: new Date().toISOString(),
  payload: { user_id: 'u_1', action: 'signup' },
});

await writer.close(); // flush buffered events
```

Optional writer tuning:

```typescript
await client.get_writer('app-events', {
  batch_size: 500,
  max_retries: 5,
});
```

Read back (after data has landed):

```typescript
const reader = await client.get_reader('app-events', {
  bot_id: 'my-app-reader',
});
for await (const event of reader) {
  console.log(event);
  break;
}
```

---

## End-to-end checklist

```bash
pnpm exec loxtep login
pnpm exec loxtep init
pnpm exec loxtep attach --instance <instance-id>
pnpm exec loxtep domains list

pnpm exec loxtep ingest provision --name app-events
# or: generate-ingest-bundle.mjs + loxtep bundle save

pnpm exec loxtep data-products list
node node_modules/@loxtep/sdk/docs/examples/write-events.mjs
```

---

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `StreamingError: … is not deployed` | No `deployment_bindings` | Complete Phase 2 (bundle + deploy) |
| `NotFoundError: Data product '…' not found` | Wrong name or wrong instance | `data-products list`; check `attach` / `instance_id` |
| `AmbiguityError: Multiple data products match` | Same name on multiple instances | Use UUID or set `instance_id` in project.json |
| Empty `domains list` | New org / permissions | Create a domain in the Web UI (Governance) |

---

## Next steps

| Resource | Description |
| -------- | ----------- |
| [Getting Started](./getting-started.md) | Login, init, attach, generate |
| [Quick Reference](./quick-reference.md) | CLI + SDK cheat sheet |
| [Code-first CLI](./code-first-cli.md) | TypeScript workflow modules + `loxtep deploy` |
| [Event Replay Cookbook](./event-replay-cookbook.md) | Replay and reprocess |
