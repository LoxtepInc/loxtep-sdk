# Code-first CLI guide

Author Loxtep workflows as TypeScript in your repo, test them locally, and
deploy to a runtime instance — without using the Studio UI as your source of
truth.

Start with the [Getting Started Guide](./getting-started.md) if you have not
yet run `login`, `init`, and `attach`.

**Sending events from your app without authoring workflow modules first?**
Use [SDK-first ingest](./sdk-first-ingest.md) instead of this guide.

---

## When do I need `loxtep init`?

| Goal | Commands |
| --- | --- |
| First-time workspace setup (new project) | `login` → `init` → `attach` → `generate` |
| **Clone** an existing cloud project locally | `login` → `projects clone <id\|name> [dir]` → `attach` → edit → `push` / `projects push` |
| Bind an **existing** cloud project to a directory (no download) | `login` → `projects link` → `attach` → edit → `push` → `deploy` |
| Author, test, and deploy workflows | … → `test` → `deploy` |
| App code with auto-config | After attach: `LoxtepClient.fromWorkspace()` |
| Stream I/O to a data product | After **deploy**: `client.get_writer(name)` |

`loxtep init` creates **`.loxtep/project.json`** and the on-disk project layout.
`loxtep projects clone` materializes Cloud → Local: **git clone** when the project
is GitHub-bound; authenticated **workspace export** (`POST /workflows/projects/{id}/export`)
when unbound. Both paths write `.loxtep/project.json` and upsert
`~/.loxtep/workspaces.json` so `loxtep status` works immediately.
`loxtep projects link` (alias `loxtep link`) binds metadata only when you already
have a local tree. Prefer `clone` for "get it from the cloud"; use `link` when
the files are already on disk.

**GitHub sync vs package push:** top-level `loxtep push` uploads unbound local
packages (Local → Cloud S3). When GitHub-bound, use `loxtep projects pull` /
`loxtep projects push` to wrap `/projects/{id}/github/pull|push`. Never pretend
Git exists for unbound projects.

**`link` ≠ `attach`:** `link`/`clone` bind the **project**; `attach` binds a runtime
**Instance** (`instance_id` + `api_url`).

Many CLI commands (`generate`, `test`, `deploy`, `attach`) require that file and
will exit with *"Run \`loxtep init\` first"* if it is missing (or run `clone` /
`link` / `init --project-id` to create it for an existing project).

`loxtep login` stores JWT credentials under **`./.loxtep/credentials.json`**
(by default). That is separate from `project.json` — you can log in before or
after `init`.

---

## Lifecycle overview

```text
pnpm add @loxtep/sdk
pnpm exec loxtep login
# New project:
pnpm exec loxtep init [--template <slug>]
# Or clone from cloud (GitHub-bound or unbound export):
pnpm exec loxtep projects clone <project_id|name> [dir]
# Or bind without downloading:
pnpm exec loxtep projects link <project_id|name>
pnpm exec loxtep attach --instance <name-or-id>
pnpm exec loxtep generate
# author workflows under workflows/
pnpm exec loxtep test <module> --event ./events/sample.json
pnpm exec loxtep push                 # unbound Local→Cloud packages
# pnpm exec loxtep projects push      # GitHub-bound S3→GitHub sync
pnpm exec loxtep deploy
```

---

## `loxtep init`

Scaffolds a **Loxtep workspace** in the current directory.

### What it creates

| Path | Purpose |
| --- | --- |
| `.loxtep/project.json` | Project identity, org binding, instance after `attach` |
| `domains/` | Domain definitions (code-first) |
| `connectors/` | Connector definitions |
| `workflows/` | Workflow modules you author and deploy |
| `data-products/` | Data product definitions |

With **`--template shopify-orders`**, init materializes the **bundled runnable
sample** (workflow, event fixture, AGENTS.md, skill, package/tsconfig). Other
slugs still write AGENTS.md + a default skill from catalog metadata when
available.

### Common flags

```bash
# Empty workspace
pnpm exec loxtep init

# From a starter template (Shopify, webhook, etc.)
pnpm exec loxtep init --template shopify-orders

# Scaffold and register a new private GitHub repo
pnpm exec loxtep init --create-repo my-loxtep-project

# Scaffold and import from an existing repo
pnpm exec loxtep init --from-repo https://github.com/org/repo.git
```

`--create-repo` and `--from-repo` are mutually exclusive.

If you are already logged in **and** the new project is attached to an instance,
init may auto-run **`generate`**; otherwise it prints next-step hints (login,
attach, generate).

---

## `loxtep attach`

Links the local workspace to a **runtime instance** (dev, staging, prod). Writes
`instance_id` and `api_url` into `.loxtep/project.json`.

```bash
pnpm exec loxtep attach --instance prod
```

Required before `generate`, `test`, and `deploy`.

---

## `loxtep generate`

Pulls live workspace metadata from the platform and emits typed constants at
**`.loxtep/generated/index.ts`** (data products, connectors, domains, queues,
workflows).

```bash
pnpm exec loxtep generate
```

Import in workflow modules:

```typescript
import { defineDataWorkflow, on } from '@loxtep/sdk';
import { workspace } from '../.loxtep/generated/index.js';

export default defineDataWorkflow({
  name: 'orders-enricher',
  triggers: [on.webhook('/shopify/orders')],
  requireApproval: ['dataProducts.write'],
  async handler(ctx, event) {
    const order = (event ?? {}) as Record<string, unknown>;
    await ctx.toolbox!.dataProducts.write(
      workspace.dataProducts.orders_enriched,
      { ...order, enriched_at: new Date().toISOString(), source: 'orders-enricher' }
    );
  },
});
```

Use **`LoxtepClient.fromWorkspace()`** in scripts to read `project.json` +
credentials without hand-wiring env vars.

---

## `loxtep setup` (shopify-orders)

After attach, provision the sample data products (idempotent):

```bash
pnpm exec loxtep setup
```

Creates `orders_raw` and `orders_enriched` via `ingest create --deploy` when
missing. Requires an org domain.

---

## `loxtep test` and `loxtep deploy`

```bash
pnpm exec loxtep test orders-enricher --event ./events/order-created.json
pnpm exec loxtep deploy
```

- **`test`** — runs one workflow module **locally with live instance I/O** and
  prints an action trace. Guarded ops (`requireApproval`) prompt; reject/timeout
  and handler errors exit **nonzero**.
- **`deploy`** — compiles modules into the platform workflow graph and deploys to
  the attached instance.

---

## Troubleshooting

### "Run `loxtep init` first"

You ran `generate`, `test`, `deploy`, or `attach` outside a scaffolded
workspace. From your project root:

```bash
pnpm exec loxtep init
```

### "Attach an instance first"

Run:

```bash
pnpm exec loxtep attach --instance <name-or-id>
pnpm exec loxtep generate
```

### Login works but CLI commands still fail auth

Credentials live in `./.loxtep/credentials.json`; workspace config lives in
`.loxtep/project.json`. You need **both** for the full code-first lifecycle.

---

## See also

- [Getting Started Guide](./getting-started.md) — programmatic path (no init)
- [Quick Reference](./quick-reference.md) — SDK + CLI cheat sheet
- [SDK README](../README.md) — full CLI command table
- [AGENTS.md](../AGENTS.md) — agent-oriented contract for CLI + MCP
