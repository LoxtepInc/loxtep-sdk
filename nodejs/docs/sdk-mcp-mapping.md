# MCP tools vs SDK (Phase D namespace alignment)

This is a **guide for agents**, not an exhaustive OpenAPI listing. MCP stays on
**HTTP**; the SDK adds **typed REST** and the **stream data plane** for live
I/O.

The SDK exposes **10 namespaces** that mirror hosted MCP tool facades. Old flat
namespaces (`data_products`, `workflows`, `connectors`, …) are **removed** — no
deprecation aliases.

| MCP facade | SDK namespace | Nested APIs / notes |
| --- | --- | --- |
| `loxtep_session` | `client.session` | `get_current_user`, `get_current_organization`, `logout` |
| `loxtep_connectors`, `loxtep_templates` | `client.connect` | `.connectors.*`, `.templates.*` |
| `loxtep_projects`, `loxtep_instances`, `loxtep_workspace` (versions) | `client.workspace` | `.projects.*`, `.instances.*`, `.versions` (REST pending) |
| `loxtep_workflows`, `loxtep_triggers`, `loxtep_data_products`, `loxtep_deployments` | `client.build` | `.workflows.*`, `.triggers.*`, `.data_products.*`, `.targets.*`, `.get_writer({ bot_id, queue })` escape hatch |
| `loxtep_schemas`, `loxtep_quality`, catalog domains | `client.define` | `.schemas.*`, `.quality.*`, `.standards.*`, `.data_contracts.*`, `.domains.*` |
| `loxtep_ontology`, `loxtep_semantic_layer` | `client.meaning` | `.thesaurus.*` (ontology/semantic REST split pending) |
| `loxtep_approvals` | `client.review` | `.approvals.*`, `.improvements.*` |
| `loxtep_catalog`, `loxtep_analytics` | `client.query` | `.catalog.*`, `.discovery.*`, `.query()`, `.list_tables()`, `.search()` |
| observe + `loxtep_workspace` queue hints | `client.observe` | `.status()`, `.stream_config()`, queue `.open_reader` / `.open_writer` / metadata |
| `loxtep_process_intel`, `loxtep_procedures` | `client.context` | `.process_intelligence.*`, `.procedures.*`, `.activity.*` |

## Top-level stream I/O

Preferred write/read path — resolves deployment metadata automatically:

```typescript
const writer = await client.get_writer('orders_raw');
const reader = await client.get_reader('orders_raw');
```

Same on Python: `client.get_writer("orders_raw")`, `client.get_reader("orders_raw")`.

Low-level workflow writer escape hatch: `client.build.get_writer(workflow_id, { bot_id, output_queue_name, … })`.

Vocabulary: MCP uses `loxtep_triggers` (backend: connections) and target operations
(backend: consumptions).

When unsure: **MCP for provisioning and agent tool calls**; **SDK for runtime**
services running in your infrastructure or CI.
