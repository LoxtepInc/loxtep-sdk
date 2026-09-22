# Shopify orders sample (`shopify-orders`)

Minimal code-first Loxtep workspace used by [Try it](https://loxtep.io/try-it).

## Prerequisites

| Requirement | Notes |
| --- | --- |
| **Node.js 22+** | `node --version` |
| **Loxtep account** | [app.loxtep.io](https://app.loxtep.io) |
| **Auth** | `loxtep login` (writes `./.loxtep/credentials.json`) |
| **Instance** | Non-production preferred — `loxtep instances list` then `loxtep attach` |
| **Domain** | Org must have at least one domain (create in UI if none) |

`loxtep test` executes your handler **locally with live instance I/O** (stream writes).
It is not an offline simulator. Sample writes require terminal approval
(`requireApproval: ['dataProducts.write']`).

## Lifecycle (empty directory → deploy)

```bash
mkdir shopify-orders-demo && cd shopify-orders-demo
npm init -y
npm install @loxtep/sdk@^0.9.16
npx loxtep login
npx loxtep init --template shopify-orders
npx loxtep attach --instance <non-prod-instance-id>
npx loxtep setup                 # provisions orders_raw + orders_enriched (idempotent)
npx loxtep generate
npx loxtep test orders-enricher --event ./events/order-created.json
# Approve dataProducts.write when prompted (y)
npx loxtep deploy
```

Re-running `setup` is safe: existing data products are reused.

## What this template scaffolds

| Path | Purpose |
| --- | --- |
| `workflows/orders-enricher.ts` | Sample module (webhook → enrich → write) |
| `events/order-created.json` | Fixture for `loxtep test` |
| `AGENTS.md` / `.loxtep/skills/` | Agent + skill scope |
| `package.json` / `tsconfig.json` | Node 22 + typed workflows |

## Approval / failure behavior

- Reject or timeout on a guarded write → operation skipped, **nonzero exit**
- Handler or toolbox errors → recorded in the action trace, **nonzero exit**
- Success → exit 0 and a trace with `handler.start` → `dataProducts.write` → `handler.complete`
