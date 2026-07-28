# Write to a data product from your app (Python)

You installed the SDK, initialized a workspace, and attached an instance. Next:
**create a data product**, open a writer, and send events from your code.

Workspace lifecycle (`login` / `init` / `attach` / `ingest provision`) uses the
**Node.js CLI** (`@loxtep/sdk`). The Python package is the library you call from
your app. Shared files: `.loxtep/project.json` and `.loxtep/credentials.json`.

> Already set up login, init, and attach? Use the Node [getting started](../../nodejs/docs/getting-started.md)
> steps, then come back here for `from_workspace` + `get_writer`.

---

## Phase 1 — Workspace ready

From your project directory (the folder with `.loxtep/project.json`):

```bash
# Node CLI (canonical for lifecycle)
pnpm add @loxtep/sdk   # or: npm i -g @loxtep/sdk
pnpm exec loxtep login
pnpm exec loxtep init
pnpm exec loxtep attach --instance <instance-id>
pnpm exec loxtep config list
```

You should see `project_id` and `instance_id` from `attach`. Attach also writes
`region` + `streams` into `.loxtep/project.json` so Python `get_writer` can use
the stream bus without manual `LEO_*` env vars.

Install the Python SDK in the same project (or a service that uses that workspace):

```bash
pip install 'loxtep[streams]'
```

---

## Phase 2 — Create your data product

```bash
pnpm exec loxtep ingest provision --name app-events
# then deploy when ready (see Node sdk-first-ingest docs)
pnpm exec loxtep deploy
```

That is all you need for SDK writes — one name your app will use.

---

## Phase 3 — Confirm it exists

```bash
pnpm exec loxtep data-products list
# or, after login, via the Python CLI:
loxtep projects list
```

You should see `app-events` (or whatever name you chose).

---

## Phase 4 — Write from your application

```python
from loxtep import LoxtepClient

client = LoxtepClient.from_workspace()

writer = client.get_writer("app-events")
writer.write({"user_id": "u_1", "action": "signup"})
writer.close()

client.close()
```

Pass your **business fields** to `write()`. The SDK wraps them for transport —
do not build an envelope or use a `payload` property yourself.

Async:

```python
import asyncio
from loxtep import AsyncLoxtepClient

async def main():
    async with AsyncLoxtepClient.from_workspace() as client:
        writer = await client.get_writer("app-events")
        await writer.write({"user_id": "u_1", "action": "signup"})
        await writer.close()

asyncio.run(main())
```

### Read back (optional)

```python
client = LoxtepClient.from_workspace()
reader = client.get_reader("app-events")
for event in reader:
    print(event)
    break
client.close()
```

---

## Quick checklist

```bash
pnpm exec loxtep login
pnpm exec loxtep init
pnpm exec loxtep attach --instance <instance-id>
pnpm exec loxtep ingest provision --name app-events
pnpm exec loxtep deploy
pip install 'loxtep[streams]'
```

Then `LoxtepClient.from_workspace()` + `get_writer("app-events")` in your app.

---

## If something goes wrong

| What you see | What to do |
| ------------ | ---------- |
| Cannot auto-configure: api_url / token | Run Node `loxtep login` + `attach` from the project directory. |
| Data product not found | `loxtep data-products list` (Node). Name must match `get_writer(...)` exactly. |
| Not ready / no stream bus | Re-run `attach`, ensure `streams` is in `.loxtep/project.json`, install `loxtep[streams]`. |
| Multiple products with the same name | Pass the data product id, or ensure `attach` points at the right instance. |

---

## CLI note for Python users

The `loxtep` entry point from `pip install loxtep` keeps a small native set
(`query`, `stream`, `replay`, `generate`, …) and **delegates** everything else
(`init`, `attach`, `ingest`, `deploy`, …) to `npx loxtep`. You still need Node
for workspace setup. Prefer calling the Node CLI directly for those commands.
