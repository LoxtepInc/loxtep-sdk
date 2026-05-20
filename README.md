# Loxtep SDKs

Official client libraries for the [Loxtep](https://loxtep.com) data mesh platform.

| Language | Package | Status |
|----------|---------|--------|
| Node.js | [`@loxtep/sdk`](https://www.npmjs.com/package/@loxtep/sdk) | ✅ Active |
| Python | `loxtep` | 🚧 In progress |
| Rust | `loxtep` | 🚧 In progress |

## Quick start

### Node.js

```bash
npm install @loxtep/sdk
npx loxtep login
```

```ts
import { LoxtepClient } from '@loxtep/sdk';

const client = new LoxtepClient({
  api_url: 'https://api.loxtep.com',
  auth: { type: 'jwt', token: process.env.LOXTEP_AUTH_TOKEN! },
});

const writer = await client.data_products.get_writer('my-data-product');
writer.write({ id: '1', payload: { name: 'Alice' } });
await writer.close();
```

See [`nodejs/README.md`](./nodejs/README.md) for full documentation.

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
