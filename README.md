# Loxtep SDKs

Loxtep is the **Enterprise Context Layer**: the system that turns organizational
knowledge, expertise, and norms into machine-usable context for AI across
heterogeneous systems.

Official client libraries for the [Loxtep](https://loxtep.com) platform.

| Language | Package | Status |
|----------|---------|--------|
| Node.js | [`@loxtep/sdk`](https://www.npmjs.com/package/@loxtep/sdk) | ✅ Active |
| Python | `loxtep` | 🚧 In progress |
| Rust | `loxtep` | 🚧 In progress |

## Quick start

New to Loxtep? Start in a **fresh project directory** and wire up the CLI
workspace before you write application code.

```bash
mkdir my-loxtep-app && cd my-loxtep-app
pnpm add @loxtep/sdk

# 1. Authenticate
pnpm exec loxtep login
pnpm exec loxtep whoami

# 2. Scaffold a local workspace (.loxtep/project.json, workflows/, …)
pnpm exec loxtep init

# 3. Bind the workspace to a runtime instance
pnpm exec loxtep instances list
pnpm exec loxtep attach --instance <instance-id>

# 4. Pull typed constants from the platform
pnpm exec loxtep generate
```

You now have an attached project. Explore what exists on the instance:

```bash
pnpm exec loxtep data-products list
# project_id is in .loxtep/project.json after init
pnpm exec loxtep workflows list --project-id <project-id>
```

**Next:** author workflows under `workflows/`, run `pnpm exec loxtep test …`,
then `pnpm exec loxtep deploy`. Full lifecycle:
[`nodejs/docs/code-first-cli.md`](./nodejs/docs/code-first-cli.md).

### Programmatic SDK (after attach)

Once logged in and attached, bootstrap the client from your workspace files —
no manual `api_url` / token wiring:

```ts
import { LoxtepClient } from '@loxtep/sdk';

const client = await LoxtepClient.fromWorkspace();
const me = await client.session.get_current_user();
console.log(me.user.email, me.organization?.name);
```

**Stream I/O** (`get_writer` / `get_reader`) requires a **deployed** data
product on your attached instance. After you deploy a workflow that publishes
one:

```ts
const writer = await client.get_writer('orders'); // name from `data-products list`
writer.write({ order_id: '1', total: 42.0 });
await writer.close();
```

See [`nodejs/README.md`](./nodejs/README.md) for the full API surface and CLI
reference.

### Other ways to work with Loxtep

| Path | When to use it |
| --- | --- |
| **Code-first CLI** | TypeScript workflows in git — `init → attach → generate → test → deploy` |
| **Agent-first (MCP)** | Drive Loxtep from Cursor, Claude, Kiro, etc. — [loxtep-plugins-skills](https://github.com/LoxtepInc/loxtep-plugins-skills) |
| **Web UI** | Visual setup at [app.loxtep.io](https://app.loxtep.io) |

Platform overview: [Loxtep Quickstart](https://docs.loxtep.io/quickstart).

### Python

```bash
pip install loxtep
loxtep login
```

See [`python/README.md`](./python/README.md).

## Repository structure

```
loxtep-sdk/
├── nodejs/          ← @loxtep/sdk (npm)
├── python/          ← loxtep (PyPI)
├── rust/            ← loxtep (crates.io)
├── shared/          ← OpenAPI spec, test fixtures, contract schemas
└── .github/
    └── workflows/   ← Per-language CI and publish workflows
```

## Contributing

Each SDK has its own development setup. See the README in each language directory.

## License

MIT
