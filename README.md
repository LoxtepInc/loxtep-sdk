# Loxtep SDKs

Loxtep is the **Enterprise Context Layer**: the system that turns organizational
knowledge, expertise, and norms into machine-usable context for AI across
heterogeneous systems.

Official client libraries for the [Loxtep](https://loxtep.io) platform.

| Language | Package | Status |
|----------|---------|--------|
| Node.js | [`@loxtep/sdk`](https://www.npmjs.com/package/@loxtep/sdk) | ✅ Active — CLI + full client |
| Python | [`loxtep`](https://pypi.org/project/loxtep/) | ✅ Active — client + streams; CLI lifecycle via Node |
| Rust | `loxtep` | 🚧 Placeholder (not published) |

## Quick start (Node.js)

Start in a **fresh project directory**. The Node package installs both the
`loxtep` CLI and the programmatic SDK.

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

**Provision a data product and write from your app:**

```bash
pnpm exec loxtep ingest provision --name app-events
# then lint / push / deploy as documented in the getting-started guide
```

```bash
pnpm exec loxtep data-products list
# project_id is in .loxtep/project.json after init
pnpm exec loxtep workflows list --project-id <project-id>
```

**Walkthroughs:**

- [Getting started](./nodejs/docs/getting-started.md) — zero to first event
- [SDK-first ingest](./nodejs/docs/sdk-first-ingest.md) — greenfield `get_writer` path
- [Code-first CLI](./nodejs/docs/code-first-cli.md) — TypeScript workflow modules
- [Quick reference](./nodejs/docs/quick-reference.md) — CLI + SDK cheat sheet

### Programmatic SDK (after attach)

```ts
import { LoxtepClient } from '@loxtep/sdk';

const client = await LoxtepClient.fromWorkspace();
const me = await client.session.get_current_user();
console.log(me.user.email, me.organization?.name);
```

To mint tokens from app code (email/password or browser) instead of the CLI, see
**Login from code** in [`nodejs/README.md`](./nodejs/README.md) — that uses the
isolated `sdk_node` session channel.

**Stream I/O** (`get_writer` / `get_reader`) requires a **deployed** data
product on your attached instance:

```ts
const writer = await client.get_writer('orders'); // name from `data-products list`
writer.write({ order_id: '1', total: 42.0 });
await writer.close();
```

Full API surface and CLI reference: [`nodejs/README.md`](./nodejs/README.md).

### Other ways to work with Loxtep

| Path | When to use it |
| --- | --- |
| **Code-first CLI** | TypeScript workflows in git — `init → attach → generate → test → deploy` |
| **Agent-first (MCP)** | Drive Loxtep from Cursor, Claude, Kiro, etc. — [loxtep-plugins-skills](https://github.com/LoxtepInc/loxtep-plugins-skills) |
| **Web UI** | Visual setup at [app.loxtep.io](https://app.loxtep.io) |

Platform overview: [Loxtep Quickstart](https://docs.loxtep.io/quickstart).

## Python

Use the **Node CLI** for login / init / attach / provision / deploy. Use the
Python package for application code and stream I/O.

```bash
pnpm add @loxtep/sdk
pnpm exec loxtep login && pnpm exec loxtep init && pnpm exec loxtep attach --instance <id>

pip install 'loxtep[streams]'
```

```python
from loxtep import LoxtepClient

client = LoxtepClient.from_workspace()
writer = client.get_writer("app-events")
writer.write({"user_id": "u_1", "action": "signup"})
writer.close()
```

Native Python login (no Node CLI): `login` / `browser_login` in
[`python/README.md`](./python/README.md) — **`sdk_python`** channel, separate
from CLI credentials.

See [`python/docs/sdk-first-ingest.md`](./python/docs/sdk-first-ingest.md) and
[`python/README.md`](./python/README.md). Skills / workflow-authoring helpers are
not yet ported from Node; codegen and `from_workspace()` are native Python.

## Repository structure

```
loxtep-sdk/
├── nodejs/          ← @loxtep/sdk (npm) — CLI + TypeScript client
├── python/          ← loxtep (PyPI) — Python client + optional streams
├── rust/            ← placeholder crate (not on crates.io yet)
├── shared/          ← API contract schemas + cross-SDK test fixtures
├── SECURITY.md      ← vulnerability reporting
└── .github/
    └── workflows/   ← CI and publish (npm / PyPI Trusted Publishing)
```

## Contributing

Each language package has its own README with setup and test commands:

- [`nodejs/README.md`](./nodejs/README.md)
- [`python/README.md`](./python/README.md)
- [`rust/leo-sdk/README.md`](./rust/leo-sdk/README.md)

## Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities privately.

## License

[MIT](./LICENSE)
