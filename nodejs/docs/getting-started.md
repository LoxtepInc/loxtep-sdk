# SDK Getting Started Guide

Get from zero to a working Loxtep workspace: authenticate, scaffold a project,
attach to a runtime instance, and generate typed constants. Stream read/write
comes **after** you deploy a workflow that publishes a data product.

> **Other paths:** [Code-first CLI](./code-first-cli.md) (`init → attach →
> generate → test → deploy`), [Agent-first MCP](https://github.com/LoxtepInc/loxtep-plugins-skills),
> or the **Web UI** at [app.loxtep.io](https://app.loxtep.io).
> Overview: [Loxtep Quickstart](https://docs.loxtep.io/quickstart).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Install the SDK](#step-1-install-the-sdk)
- [Step 2: Log In](#step-2-log-in)
- [Step 3: Scaffold a Workspace](#step-3-scaffold-a-workspace)
- [Step 4: Attach to an Instance](#step-4-attach-to-an-instance)
- [Step 5: Generate Typed Constants](#step-5-generate-typed-constants)
- [Step 6: Explore the Platform](#step-6-explore-the-platform)
- [Step 7: Use the SDK in Application Code](#step-7-use-the-sdk-in-application-code)
- [Step 8: Write and Read Events (after deploy)](#step-8-write-and-read-events-after-deploy)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js 22+** | Required for `@loxtep/sdk`. Check with `node --version`. |
| **Loxtep account** | Sign up at [app.loxtep.io](https://app.loxtep.io). |
| **Runtime instance** | Your org needs at least one instance (`loxtep instances list`). New trials usually include a shared dev instance. |

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

```bash
pnpm exec loxtep init
```

Optional starter template:

```bash
pnpm exec loxtep init --template shopify-orders
```

This creates:

| Path | Purpose |
| --- | --- |
| `.loxtep/project.json` | Project identity; updated by `attach` |
| `workflows/` | Workflow modules you author and deploy |
| `connectors/`, `domains/`, `data-products/` | Code-first resource folders |

`init` can run before or after `login`. Platform project registration happens
when you're authenticated; local scaffolding always succeeds.

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

## Step 6: Explore the Platform

```bash
pnpm exec loxtep data-products list
pnpm exec loxtep workflows list --project-id <project-id>
pnpm exec loxtep domains list
```

On a new account, **data products may be empty** until you create and deploy
workflows (CLI, MCP, or Web UI). That's expected — don't call `get_writer` yet.

---

## Step 7: Use the SDK in Application Code

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

## Step 8: Write and Read Events (after deploy)

`get_writer` and `get_reader` resolve queue, bot, and stream configuration from
**deployment metadata**. They only work for data products that exist **and** are
deployed on your attached instance.

1. Author a workflow under `workflows/` (see [Code-first CLI](./code-first-cli.md)).
2. `pnpm exec loxtep deploy`
3. Confirm the data product name:

   ```bash
   pnpm exec loxtep data-products list
   ```

4. Stream from application code:

```typescript
const client = await LoxtepClient.fromWorkspace();

const writer = await client.get_writer('orders'); // use your deployed name
writer.write({
  order_id: 'ord_1',
  total: 99.5,
});
await writer.close();

const reader = await client.get_reader('orders', {
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
| [Code-first CLI guide](./code-first-cli.md) | Workflow modules, `test`, `deploy` |
| [Quick Reference Card](./quick-reference.md) | Cheat sheet for common operations |
| [Event Replay Cookbook](./event-replay-cookbook.md) | Replay and reprocess historical events |

See the [SDK README](../README.md) for the full API surface and CLI reference.
