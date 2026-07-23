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

The SDK supports two developer workflows:

- **Programmatic** — write/read events from application code using `LoxtepClient`
- **Code-first CLI** — author workflows as TypeScript, test locally, deploy:
  [`loxtep init → attach → generate → test → deploy`](./nodejs/docs/code-first-cli.md)

There are also non-SDK paths: **Agent-first (MCP)** via [loxtep-plugins-skills](https://github.com/LoxtepInc/loxtep-plugins-skills), and the **Web UI** at [app.loxtep.io](https://app.loxtep.io). All paths are covered in the [Loxtep Quickstart](https://docs.loxtep.io/quickstart).

### Node.js

```bash
pnpm add @loxtep/sdk
pnpm exec loxtep login
```

```ts
import { LoxtepClient } from '@loxtep/sdk';

const client = new LoxtepClient({
  api_url: 'https://api.loxtep.com',
  auth: { type: 'jwt', token: process.env.LOXTEP_AUTH_TOKEN! },
});

// Top-level stream I/O (resolves queue, bot, stream config from deployment metadata)
const writer = await client.get_writer('my-data-product');
writer.write({ id: '1', payload: { name: 'Alice' } });
await writer.close();
```

Since **v0.7.0**, `LoxtepClient` exposes grouped API areas on the client
(`session`, `connect`, `workspace`, `build`, `define`, `meaning`, `review`,
`query`, `observe`, `context`). See [`nodejs/README.md`](./nodejs/README.md).
For the code-first workflow (`loxtep init`), see
[`nodejs/docs/code-first-cli.md`](./nodejs/docs/code-first-cli.md).

### Python

```bash
pip install loxtep
loxtep login
```

See [`python/README.md`](./python/README.md) for full documentation.

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
