# MCP, CLI, and Node SDK — one pairing story

## Same API host

Use one base URL everywhere:

- **REST / SDK:** `LOXTEP_API_URL` or `config.json` → `api_url`
- **Customer MCP / browser login:** same base URL in credentials

The CLI and SDK resolve tokens in this order: **`LOXTEP_AUTH_TOKEN`** →
**`~/.loxtep/credentials.json`** (shared: `loxtep login` and
`npx @loxtep/customer-mcp-server login`). You should not need two logins for the
same machine if you use one file-based flow.

## When to use what

| Job | Tool |
| --- | ---- |
| Provision org resources, run catalog/dataproduct MCP tools, IDE agent calls | **Customer MCP** (HTTP tools against the platform) |
| Typed REST from Node services, scripts, CI | **`@loxtep/sdk`** (`LoxtepClient`) |
| Quick operator commands, token bootstrap | **`loxtep` CLI** (ships with the SDK) |
| **Live** queue produce/consume | **SDK** with stream config |
| **Historical** replay / trace-style reads | **SDK** `data_products.replay()` (REST API) |

There is **no** required joint npm install of MCP and SDK; pair them by
**config + docs**, not a metapackage.

## Install

```bash
npm install @loxtep/sdk
# Node.js 22+ recommended (see package engines).
```

## See also

- [MCP → SDK mapping](./sdk-mcp-mapping.md)
- [Event replay cookbook](./event-replay-cookbook.md)
