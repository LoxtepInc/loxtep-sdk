# SDK Getting Started Guide

Get from zero to your first event in under 5 minutes. This guide walks you
through installing the Loxtep SDK, authenticating, and writing your first event
to a data product — all with a single method call.

> **Other paths:** This guide covers the **programmatic SDK** path (no
> `loxtep init` required). For **code-first workflow authoring**, see the
> [Code-first CLI guide](./code-first-cli.md) (`init → attach → generate → test → deploy`).
> Loxtep also supports an [Agent-first (MCP)](https://github.com/LoxtepInc/loxtep-plugins-skills)
> path and a **Web UI** at [app.loxtep.io](https://app.loxtep.io). See the
> [Loxtep Quickstart](https://docs.loxtep.io/quickstart) for all paths.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Install the SDK](#step-1-install-the-sdk)
- [Step 2: Log In](#step-2-log-in)
- [Step 3: Write Your First Event](#step-3-write-your-first-event)
- [Step 4: Read Events Back](#step-4-read-events-back)
- [Complete Example](#complete-example)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Prerequisites

Before you begin, make sure you have:

| Requirement | Details |
|-------------|---------|
| **Node.js 22+** | Required for the Node.js SDK (`@loxtep/sdk`). Check with `node --version`. |
| **Loxtep account** | You need an account with the **developer** role. Ask your org admin if you don't have one. |
| **A deployed data product** | Your organization must have at least one data product deployed to an instance. |

---

## Step 1: Install the SDK

```bash
pnpm add @loxtep/sdk
```

Or with your preferred package manager:

```bash
npm install @loxtep/sdk
# or
yarn add @loxtep/sdk
```

Verify the installation:

```bash
pnpm exec loxtep --version
```

---

## Step 2: Log In

Authenticate with your Loxtep account. This stores credentials locally so the
SDK can make API calls on your behalf.

```bash
pnpm exec loxtep login
```

Follow the prompts to enter your email and password. On success you'll see:

```
✓ Logged in successfully. Credentials saved to ./.loxtep/credentials.json
```

**Alternative: use an environment variable.** If you're running in CI/CD or a
container, set the token directly instead of using `loxtep login`:

```bash
export LOXTEP_AUTH_TOKEN="your-jwt-token"
```

The SDK checks `LOXTEP_AUTH_TOKEN` first, then `./.loxtep/credentials.json`
(walking up from cwd), then `~/.loxtep/credentials.json`.

---

## Step 3: Write Your First Event

With the new data-product-centric API, you write events by referencing a data
product by name. The SDK resolves all the plumbing (queue names, bot IDs, stream
bus configuration) automatically.

```typescript
import { LoxtepClient } from '@loxtep/sdk';

const client = new LoxtepClient({
  api_url: process.env.LOXTEP_API_URL,
  auth: { type: 'jwt', token: process.env.LOXTEP_TOKEN },
});

// Write events to a data product by name (top-level — preferred since v0.7.0)
const writer = await client.get_writer('my-data-product');
writer.write({ id: '123', name: 'Alice' });
await writer.close();
```

That's it. No workflow IDs, no deployment lookups, no queue name conventions.
The SDK resolves the data product's runtime bindings, connects to the correct
stream bus, and writes directly to the data product queue.

### What happens under the hood

1. The SDK looks up the data product by name via the platform API
2. It resolves the runtime configuration (queue, bot identity, stream config)
3. It connects to the stream data plane and returns a writer pointed at the correct queue

### Writer options

You can customize the writer behavior with an options object:

```typescript
const writer = await client.get_writer('my-data-product', {
  bot_id: 'custom-bot-id',   // Override the resolved bot identity
  batch_size: 500,            // Events per batch (default: 100)
  max_retries: 5,             // Retry attempts on failure (default: 3)
});
```

---

## Step 4: Read Events Back

Reading from a data product is just as simple:

```typescript
const reader = await client.get_reader('my-data-product');

for await (const event of reader) {
  console.log('Received:', event);
}
```

The reader yields events as an async iterable. By default it generates a
reader bot ID of `sdk-reader-{data-product-name}` for checkpoint tracking.

### Reader options

```typescript
const reader = await client.get_reader('my-data-product', {
  bot_id: 'my-consumer',     // Custom reader identity for checkpointing
  from: 'z/2024/01/01',      // Start position (default: latest checkpoint)
  batch_size: 200,            // Events per batch (default: 100)
});
```

---

## Complete Example

```typescript
// first-event.ts
// Run: pnpm exec tsx first-event.ts

import { LoxtepClient } from '@loxtep/sdk';

async function main() {
  const client = new LoxtepClient({
    api_url: process.env.LOXTEP_API_URL,
    auth: { type: 'jwt', token: process.env.LOXTEP_TOKEN },
  });

  // Write an event to a data product
  const writer = await client.get_writer('my-data-product');

  writer.write({
    id: `event-${Date.now()}`,
    timestamp: new Date().toISOString(),
    payload: { message: 'Hello from the Loxtep SDK!' },
  });

  await writer.close();
  console.log('✓ Event written');

  // Read it back
  const reader = await client.get_reader('my-data-product', {
    bot_id: 'quickstart-reader',
  });

  for await (const event of reader) {
    console.log('✓ Event received:', JSON.stringify(event, null, 2));
    break; // Just read the first one to verify
  }

  console.log('Done!');
}

main().catch(console.error);
```

---

## Troubleshooting

### Data product not found

**Symptom:** `NotFoundError: Data product 'my-data-product' not found`

**Cause:** The SDK could not find a data product matching the name you provided.

**Fix:**

1. Verify the data product name is spelled correctly (names are case-sensitive).
2. Check that the data product's workflow has been deployed to an instance.
3. If you're using a UUID, confirm it matches an existing data product ID.

```bash
# List data products in your organization
pnpm exec loxtep data-products list
```

---

### Data product not deployed

**Symptom:** `StreamingError: Data product 'my-data-product' is not deployed.
Deploy the workflow first.`

**Cause:** The data product exists in the workflow graph but has not been
deployed to an instance. Runtime bindings (queue name, bot ID) are only
available after deployment.

**Fix:**

1. Deploy the workflow containing the data product:

```bash
pnpm exec loxtep deploy <workflow-id>
```

2. Or deploy via the Loxtep UI: **Workflows** → select your workflow → **Deploy**.

3. If using an AI assistant with MCP, use the `deploy_workflow` tool.

---

### Unable to resolve stream configuration

**Symptom:** `StreamingError: Failed to resolve stream config for instance
<instance-id>`

**Cause:** The SDK resolved the data product and its instance, but could not
retrieve the stream configuration from the instance record.

**Fix:**

1. Verify the instance is fully provisioned and running in the Loxtep UI.
2. Check that your account has `instances:read` permission on the target instance.
3. If the instance was recently created, wait a few minutes for provisioning to
   complete.
4. Contact your platform admin if the instance shows as provisioned but
   resolution still fails.

---

### Multiple data products match

**Symptom:** `AmbiguityError: Multiple data products match 'my-data-product'.
Found matches on instances: [instance-a, instance-b]`

**Cause:** The same data product name exists on multiple instances and the SDK
cannot determine which one you mean.

**Fix:**

1. Set `instance_id` in the client options to scope resolution to a specific
   instance:

```typescript
const client = new LoxtepClient({
  api_url: process.env.LOXTEP_API_URL,
  auth: { type: 'jwt', token: process.env.LOXTEP_TOKEN },
  instance_id: process.env.LOXTEP_INSTANCE_ID,
});
```

2. Or use the data product's UUID instead of its name:

```typescript
const writer = await client.get_writer('09fa202b-...');
```

---

### Missing Auth Token

**Symptom:** `AuthenticationError: No authentication token found`

**Cause:** The SDK cannot find a JWT token. Set `LOXTEP_AUTH_TOKEN` (CLI) or
`LOXTEP_TOKEN` (programmatic auto-config), or run `pnpm exec loxtep login` so
`./.loxtep/credentials.json` exists (or `~/.loxtep/credentials.json` with
`--global`).

**Fix:**

```bash
# Option 1: Log in interactively
pnpm exec loxtep login

# Option 2: Set the token directly (CLI / manual client bootstrap)
export LOXTEP_AUTH_TOKEN="your-jwt-token"
# Auto-config via LoxtepClient.fromWorkspace() also reads LOXTEP_TOKEN
export LOXTEP_TOKEN="your-jwt-token"
```

---

## Next Steps

Now that you've written and read your first event, explore these resources:

| Resource | Description |
|----------|-------------|
| [Code-first CLI guide](./code-first-cli.md) | `loxtep init`, attach, generate, test, deploy |
| [Quick Reference Card](./quick-reference.md) | Single-page cheat sheet for common SDK operations |
| [Event Replay Cookbook](./event-replay-cookbook.md) | Patterns for replaying and reprocessing historical events |

See the [SDK README](../README.md) for the full API surface.
