# SDK Getting Started Guide

Get from zero to a working Loxtep workspace: authenticate, scaffold a project,
attach to a runtime instance, **provision your first source data product**, and
write events with `get_writer`.

> **SDK-first ingest (login → init → attach → write):**
> [SDK-first ingest](./sdk-first-ingest.md) — the primary path when your app
> sends events via the SDK (no SaaS connector first).
>
> **Other paths:** [Code-first CLI](./code-first-cli.md) (`init → attach →
> generate → test → deploy`), [Agent-first MCP](https://github.com/LoxtepInc/loxtep-plugins-skills),
> or the **Web UI** at [app.loxtep.io](https://app.loxtep.io).
> Overview: [Loxtep Quickstart](https://app.loxtep.io/docs/quickstart/quickstart).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Install the SDK](#step-1-install-the-sdk)
- [Step 2: Log In](#step-2-log-in)
- [Step 3: Scaffold a Workspace](#step-3-scaffold-a-workspace)
- [Step 4: Attach to an Instance](#step-4-attach-to-an-instance)
- [Step 5: Generate Typed Constants](#step-5-generate-typed-constants)
- [Step 6: Your first data product (SDK ingest)](#step-6-your-first-data-product-sdk-ingest)
- [Step 7: Explore the platform (optional)](#step-7-explore-the-platform-optional)
- [Step 8: Use the SDK in application code](#step-8-use-the-sdk-in-application-code)
- [Step 9: Write and read events](#step-9-write-and-read-events)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js 22+** | Required for `@loxtep/sdk`. Check with `node --version`. |
| **Loxtep account** | Sign up at [app.loxtep.io](https://app.loxtep.io). |
| **Runtime instance** | Your org needs at least one instance (`loxtep instances list`). New accounts get a default shared instance automatically; an empty list usually means wrong API host or a CLI parsing bug — not a greenfield state. |

You do **not** need an existing data product on day one. Empty lists after
attach are normal until you deploy workflows.

---

## Step 1: Install the SDK

Create a directory for your project, then install:

```bash
mkdir my-loxtep-app && cd my-loxtep-app
pnpm add @loxtep/sdk
```

Verify the CLI:

```bash
pnpm exec loxtep --version
```

---

## Step 2: Log In

```bash
pnpm exec loxtep login
pnpm exec loxtep whoami
```

On success, credentials are stored in `./.loxtep/credentials.json` (project-local
by default). `whoami` should print your email and organization — not placeholders.

**CI / headless:**

```bash
pnpm exec loxtep login --email you@company.com --password '…'
# or
export LOXTEP_AUTH_TOKEN="your-jwt-token"
```

---

## Step 3: Scaffold a Workspace

Log in **before** `init` so the CLI registers a real platform project (not a
local-only id that breaks `attach` / `generate` later):

```bash
pnpm exec loxtep init
```

Bind an **existing** org project instead of creating one:

```bash
pnpm exec loxtep init --project-id <project-uuid>
pnpm exec loxtep projects list   # discover UUIDs
```

Optional starter template:

```bash
pnpm exec loxtep init --template shopify-orders
```

This creates:

| Path | Purpose |
| --- | --- |
| `.loxtep/project.json` | **Project identity** — includes `project_id` (UUID) registered on the platform |
| `workflows/` | Workflow modules you author and deploy |
| `connectors/`, `domains/`, `data-products/` | Code-first resource folders |

### What is a project?

A **project** is your Loxtep workspace on the platform: the container for
workflows, connectors, and deploy targets. `init` registers one in your org and
writes its `project_id` into `.loxtep/project.json`. Most CLI commands read
that file automatically when you run them from the workspace directory.

To see your current project id:

```bash
pnpm exec loxtep config list
# or
cat .loxtep/project.json
```

To list every project in your organization (for example, if you skipped `init`
or work outside the scaffolded folder):

```bash
pnpm exec loxtep projects list
```

If you ran `init` before logging in and have a stale `proj_local_*` id in
`.loxtep/project.json`, run `loxtep login` then `loxtep init` again — it
registers a platform project and replaces the local id.

---

## Step 4: Attach to an Instance

List instances, then bind your workspace to one:

```bash
pnpm exec loxtep instances list
pnpm exec loxtep attach --instance <instance-id>
```

`attach` writes `instance_id` and `api_url` into `.loxtep/project.json`.
Required before `generate`, `test`, and `deploy`.

---

## Step 5: Generate Typed Constants

```bash
pnpm exec loxtep generate
```

Pulls live metadata from the platform into `.loxtep/generated/index.ts` (data
products, connectors, domains, queues, workflows). Re-run after platform changes.

---

## Step 6: Create a data product and write from your app

After `attach`, create a data product on that instance, then call `get_writer`
from your application:

```bash
pnpm exec loxtep ingest provision --name app-events
pnpm exec loxtep lint
pnpm exec loxtep deploy
pnpm exec loxtep data-products list
```

See **[Write to a data product](./sdk-first-ingest.md)** for the full flow and code sample.

---

## Step 7: Explore the platform (optional)

Run these **from your workspace directory** (where `.loxtep/project.json` lives)
after Steps 3–4:

```bash
pnpm exec loxtep config list          # confirms project_id + instance_id
pnpm exec loxtep data-products list   # org-wide catalog
pnpm exec loxtep workflows list       # uses project_id from project.json
pnpm exec loxtep domains list
```

If you are not in a scaffolded workspace, list projects first and pass an id
explicitly:

```bash
pnpm exec loxtep projects list
pnpm exec loxtep workflows list --project-id <project-id-from-list>
```

On a new account, **data products may be empty** until you complete
[Step 6](#step-6-your-first-data-product-sdk-ingest). That's expected.

---

## Step 8: Use the SDK in application code

Prefer workspace auto-config instead of hand-building `api_url` and tokens:

```typescript
import { LoxtepClient } from '@loxtep/sdk';

const client = await LoxtepClient.fromWorkspace();
const { user, organization } = await client.session.get_current_user();

console.log(user.email, organization?.name);
```

`fromWorkspace()` reads `.loxtep/project.json` and `./.loxtep/credentials.json`
(walking up from `cwd`). Env overrides: `LOXTEP_API_URL`, `LOXTEP_TOKEN`,
`LOXTEP_ORGANIZATION_ID`, `LOXTEP_PROJECT_ID`, `LOXTEP_INSTANCE_ID`.

List or manage resources via namespaced APIs:

```typescript
const { items } = await client.build.data_products.list();
const instances = await client.workspace.instances.list();
```

---

## Step 9: Write and read events

After [Step 6](#step-6-your-first-data-product-sdk-ingest), stream from
application code:

```typescript
const client = await LoxtepClient.fromWorkspace();

const writer = await client.get_writer('app-events'); // name from Step 6 / data-products list
writer.write({
  order_id: 'ord_1',
  total: 99.5,
});
await writer.close();

const reader = await client.get_reader('app-events', {
  bot_id: 'my-app-reader',
});
for await (const event of reader) {
  console.log(event);
  break;
}
```

The SDK resolves runtime bindings automatically — no manual queue names or bot IDs.

### Writer / reader options

```typescript
await client.get_writer('orders', {
  batch_size: 500,
  max_retries: 5,
});

await client.get_reader('orders', {
  bot_id: 'my-consumer',
  from: undefined, // latest checkpoint
  batch_size: 200,
});
```

---

## Troubleshooting

### Run `loxtep init` first / not attached

**Symptom:** `Run loxtep init first` or `Run loxtep attach`

**Fix:** Complete [Step 3](#step-3-scaffold-a-workspace) and
[Step 4](#step-4-attach-to-an-instance).

---

### Data product not found

**Symptom:** `NotFoundError: Data product 'orders' not found`

**Fix:** Deploy a workflow that publishes the data product, then verify with
`pnpm exec loxtep data-products list`. Names are case-sensitive.

---

### Data product not deployed

**Symptom:** `StreamingError: … is not deployed`

**Fix:** The catalog entry exists but has no runtime bindings yet. Run
`pnpm exec loxtep deploy` or deploy via MCP/UI, then retry.

---

### Missing auth token

**Symptom:** `Missing api_url or access token` / authentication errors

**Fix:**

```bash
pnpm exec loxtep login
pnpm exec loxtep whoami
```

---

### Multiple data products match

**Symptom:** `AmbiguityError: Multiple data products match …`

**Fix:** Set `instance_id` in `.loxtep/project.json` via `attach`, or pass a
data product UUID instead of a name.

---

## Next Steps

| Resource | Description |
|----------|-------------|
| [SDK-first ingest](./sdk-first-ingest.md) | Greenfield: provision + `get_writer` |
| [Code-first CLI guide](./code-first-cli.md) | Workflow modules, `test`, `deploy` |
| [Quick Reference Card](./quick-reference.md) | Cheat sheet for common operations |
| [Event Replay Cookbook](./event-replay-cookbook.md) | Replay and reprocess historical events |

See the [SDK README](../README.md) for the full API surface and CLI reference.
