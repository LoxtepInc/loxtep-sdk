# MCP, CLI, and Node SDK — one pairing story

## Same API host

Use one base URL everywhere:

- **REST / SDK:** `LOXTEP_API_URL` or `config.json` → `api_url`
- **Loxtep MCP:** hosted only — connect with a URL and OAuth 2.1 (PKCE), not a local login

The CLI and SDK resolve tokens in this order: **`LOXTEP_AUTH_TOKEN`** →
project-local **`.loxtep/credentials.json`** → **`~/.loxtep/credentials.json`**
(written by `loxtep login`). MCP auth is separate — it's a hosted server, so it
authenticates via its own OAuth flow in the MCP client, not this file.

## When to use what

| Job | Tool |
| --- | ---- |
| Provision org resources, run catalog/dataproduct MCP tools, IDE agent calls | **Loxtep MCP** (hosted; connect via URL + OAuth) |
| Typed REST from Node services, scripts, CI | **`@loxtep/sdk`** (`LoxtepClient`) |
| Quick operator commands, token bootstrap | **`loxtep` CLI** (ships with the SDK) |
| **Live** queue produce/consume | **SDK** with stream config |
| **Historical** replay / trace-style reads | **SDK** `client.build.data_products.replay()` (REST API) |

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
