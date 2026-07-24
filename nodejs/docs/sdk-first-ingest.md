# Write to a data product from your app

You installed the SDK, initialized a workspace, and attached an instance. Next:
**create a data product**, open a writer, and send events from your code.

> Already set up login, init, and attach? [Getting started](./getting-started.md).

---

## Phase 1 — Workspace ready

Run commands from your project directory (the folder with `.loxtep/project.json`).

```bash
pnpm exec loxtep login
pnpm exec loxtep init
pnpm exec loxtep attach --instance <instance-id>
pnpm exec loxtep config list
```

You should see `project_id` and `instance_id` from `attach`.

---

## Phase 2 — Create your data product (local package)

Pick a name your app will use (example: `app-events`):

```bash
pnpm exec loxtep connectors list --type sdk   # optional: see existing SDK connectors
pnpm exec loxtep ingest provision --name app-events
pnpm exec loxtep lint
```

`ingest provision` reuses an existing SDK connector when one exists (or creates one),
then writes a **local** workflow package under `connectors/` and `workflows/<id>/`.
It does **not** deploy by default. Validate with `loxtep lint`, then publish:

```bash
pnpm exec loxtep deploy --dry-run   # lint only
pnpm exec loxtep deploy             # lint + compile/deploy modules
# or: pnpm exec loxtep ingest provision --name app-events --deploy
```

That local package is what you iterate on; deploy pushes it to your instance.

---

## Phase 3 — Confirm it exists

After deploy:

```bash
pnpm exec loxtep data-products list
```

You should see `app-events` (or whatever name you chose).

---

## Phase 4 — Write from your application

The SDK reads your workspace (`.loxtep/project.json` + credentials). No manual
URL or token wiring.

```typescript
import { LoxtepClient } from '@loxtep/sdk';

const client = await LoxtepClient.fromWorkspace();

const writer = await client.get_writer('app-events');

writer.write({
  user_id: 'u_1',
  action: 'signup',
});

await writer.close();
```

Pass your **business fields** to `write()`. The SDK wraps them for transport —
you do not build an envelope or use a `payload` property yourself.

Use the same name you passed to `ingest provision`.

### Read back (optional)

```typescript
const client = await LoxtepClient.fromWorkspace();
const reader = await client.get_reader('app-events');

for await (const event of reader) {
  console.log(event);
  break;
}
```

---

## Quick checklist

```bash
pnpm exec loxtep login
pnpm exec loxtep init
pnpm exec loxtep attach --instance <instance-id>
pnpm exec loxtep ingest provision --name app-events
pnpm exec loxtep lint
pnpm exec loxtep deploy
pnpm exec loxtep data-products list
```

Then `get_writer('app-events')` in your app.

---

## If something goes wrong

| What you see | What to do |
| ------------ | ---------- |
| Data product not found | Run `data-products list`. Check the name matches `get_writer('…')` exactly. |
| Not ready to accept writes | Run `ingest provision`, then `deploy` (or `ingest provision --deploy`). Make sure you ran `attach` first. |
| Multiple products with the same name | Pass the data product id to `get_writer`, or ensure `attach` points at the right instance. |
| No domain available | Create a domain in the Loxtep UI, or pass `--domain-id` to `ingest provision`. |

---

## Other ways to create a data product

**Loxtep MCP (AI assistant)** — If you use the Loxtep MCP in Cursor, Claude Code,
or another client, describe what you want in plain language, for example:

> Create a data product named `app-events` on my current Loxtep project and
> deploy it to the instance I already attached. I want to write events from my
> app with the SDK.

The assistant provisions the same end state as `ingest provision`. After that,
Phase 4 above is unchanged: `get_writer('app-events')` and `write()`.

**Loxtep Studio (web app)** — *Beta.* You can also design and publish a data
product in the Loxtep UI. Once it exists on your instance, the SDK code in
Phase 4 is the same.
