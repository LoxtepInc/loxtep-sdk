# MCP tools vs SDK (Phase D namespace alignment)

This is a **guide for agents**, not an exhaustive OpenAPI listing. MCP stays on
**HTTP**; the SDK adds **typed REST** and the **stream data plane** for live
I/O.

The SDK exposes **10 namespaces** that mirror hosted MCP tools. Old flat
namespaces (`data_products`, `workflows`, `connectors`, …) are **removed** — no
deprecation aliases.

| MCP facade | SDK namespace | Nested APIs / notes |
| --- | --- | --- |
| `loxtep_session` | `client.session` | `get_current_user`, `get_current_organization`, `logout` |
| `loxtep_connect` | `client.connect` | `.connectors.*`, `.templates.*` |
| `loxtep_workspace` | `client.workspace` | `.projects.*`, `.instances.*`, `.versions` (REST pending); planned MCP `get_project_workspace_status` → `ProjectWorkspaceStatus` ([docs](./project-workspace-status.md)) |
| `loxtep_build` | `client.build` | `.workflows.*`, `.triggers.*`, `.data_products.*`, `.targets.*`, deploy writes, `.get_writer({ bot_id, queue })` escape hatch |
| `loxtep_define` | `client.define` | `.schemas.*`, `.quality.*`, `.standards.*`, `.data_contracts.*`, `.domains.*` |
| `loxtep_meaning` | `client.meaning` | `.thesaurus.*`, `.ontology.*`, `.packs.*`, `.semantic.*` (search/artifact/completeness) |
| `loxtep_review` | `client.review` | `.approvals.*`, `.improvements.*`, `.cdlc.*` (get/transition/propagate/lineage/deps + `list_review_queue`); `.mining.*` (`run_mining_pass`, `list_candidates`, `act_on_candidate`). CLI: `loxtep cdlc transition`, `loxtep cdlc review-queue` |
| `loxtep_query` | `client.query` | `.catalog.*`, `.discovery.*`, `.query()`, `.list_tables()`, `.search()` |
| `loxtep_observe` | `client.observe` | `.status()`, `.stream_config()`, queue `.open_reader` / `.open_writer`, `.list_deployments()`, `.get_deployment()`, trust signals |
| `loxtep_context` | `client.context` | `.process_intelligence.*`, `.procedures.*`, `.activity.*` |

## Approvals fixture / env bootstrap

Happy-path **list_pending** + **resolve** (approve/reject) integration tests use the
CLI mock catalog — no live mcpdev required for the default suite:

| Mode | Bootstrap |
| --- | --- |
| **Fixtures (CI default)** | `src/cli/__tests__/mock-platform-api.ts` — routes under `/agent-orchestration/organizations/{org}/approval-requests`. Run: `pnpm exec jest src/client/approvals.http.integration.test.ts src/cli/cli-integration.test.ts src/cli/cli-integration-mutations.test.ts` |
| **Live staging/mcpdev (optional)** | `loxtep login` (writes credentials), set `api_url` / `organization_id` in config (or `LOXTEP_API_URL` / `LOXTEP_ORGANIZATION_ID`), then `LOXTEP_CLI_SMOKE=1 pnpm exec jest src/cli/cli-staging-smoke.test.ts` |

MCP mapping: `loxtep_review.list_pending` → `client.review.approvals.list_pending()`;
`loxtep_review.resolve` → `client.review.approvals.resolve(id, 'approve'\|'reject')`
(CLI: `loxtep approvals list|approve|reject`).

## Top-level stream I/O

Preferred write/read path — resolves deployment metadata automatically:

```typescript
const writer = await client.get_writer('orders_raw');
const reader = await client.get_reader('orders_raw');
```

Same on Python: `client.get_writer("orders_raw")`, `client.get_reader("orders_raw")`.

Low-level workflow writer escape hatch: `client.build.get_writer(workflow_id, { bot_id, output_queue_name, … })`.

Vocabulary: MCP `loxtep_build` trigger operations (backend: connections) and target operations
(backend: consumptions). Connector OAuth uses `get_oauth_url`; connectivity
probe uses `test_connector` / `loxtep connectors test <id>`; sample capture uses
`capture_samples` / `loxtep connectors capture-samples <id> --entity-type <name>`.

When unsure: **MCP for provisioning and agent tool calls**; **SDK for runtime**
services running in your infrastructure or CI.

## Meaning: ontology concepts (LOX-1241)

MCP `loxtep_meaning` ontology ops map to `client.meaning.ontology`:

| MCP operation | SDK |
| --- | --- |
| `list_ontology_concepts` | `client.meaning.ontology.list_concepts()` |
| `get_ontology_concept` | `client.meaning.ontology.get_concept(concept_id)` |
| `create_ontology_concept` | `client.meaning.ontology.create_concept({ name, namespace, node_type, … })` |
| `update_ontology_concept` | `client.meaning.ontology.update_concept(concept_id, { … })` |
| `delete_ontology_concept` | `client.meaning.ontology.delete_concept(concept_id)` |
| `create_ontology_relationship` | `client.meaning.ontology.create_relationship({ source_entity_type, target_entity_type, relation_type, … })` |
| `get_ontology_relationships` | `client.meaning.ontology.get_relationships({ … })` (alias: `list_relationships`) |

REST: `/graph/organizations/{org}/ontology/concepts` and `…/relationships`.

## Meaning: vocabulary packs (LOX-1242)

These ops live under MCP **`loxtep_meaning`** / semantic-layer (not `loxtep_define`).
SDK surface: `client.meaning.packs`. CLI: `loxtep packs …`.

| MCP operation | SDK | REST |
| --- | --- | --- |
| `list_available_packs` | `client.meaning.packs.list_available()` (alias `list_available_packs`) | `GET /graph/admin/vocabulary-packs/recommend` |
| `activate_vocabulary_pack` | `client.meaning.packs.activate({ pack_id, organization_id? })` (alias `activate_vocabulary_pack`) | `POST /graph/admin/vocabulary-packs/{pack_id}/enable` body `{ organization_id }` |
| `get_pack_activation_status` | `client.meaning.packs.get_activation_status()` (alias `get_pack_activation_status`) | `GET /graph/semantic-layer/activation-state` |

CLI verbs:

| CLI | SDK |
| --- | --- |
| `loxtep packs list` | `list_available()` |
| `loxtep packs activate <pack_id> [--organization-id]` | `activate({ pack_id, organization_id })` |
| `loxtep packs status` | `get_activation_status()` |

Notes:

- Activation status is normalized to snake_case (`activation_state`, `active_pack_id`, …) whether the graph handler returns camelCase or snake_case.
- `list_available` follows the MCP/recommend path (same as hosted tools). Admin inventory `GET /graph/admin/vocabulary-packs` is a sibling route; if recommend is unavailable, callers may see errors from that path specifically.
- Requires `catalog:read` for list/status and `admin:vocabulary` for activate (platform RBAC).

## Meaning: semantic search / completeness (LOX-1243)

MCP `loxtep_meaning` semantic-layer read ops map to `client.meaning.semantic`:

| MCP operation | SDK | REST |
| --- | --- | --- |
| `search_semantic_layer` | `client.meaning.semantic.search({ query, … })` (alias `search_semantic_layer`; string query shorthand OK) | `POST /semantic-layer/search` |
| `get_semantic_artifact` | `client.meaning.semantic.get_artifact({ artifact_type, id })` (alias `get_semantic_artifact`; `artifact_id` accepted) | `GET /semantic-layer/{segment}/{id}` |
| `get_semantic_completeness` | `client.meaning.semantic.get_completeness({ domain_id? })` (alias `get_semantic_completeness`) | `GET /semantic-layer/completeness` |

Artifact path segments (MCP parity): `entity`→`entities`, `glossary_term`→`glossary`, `process_map`→`process-maps`; other types use the raw `artifact_type` string.

Notes:

- Requires `catalog:read` (platform RBAC).
- SDK calls the semantic-layer MS REST routes directly. MCP-only enrichments (empty-search / completeness `metadata.activation_state` from pack activation) are not duplicated — use `client.meaning.packs.get_activation_status()` when needed.
- Pack lifecycle remains under `client.meaning.packs` (see vocabulary packs section above).

## Context: procedures CRUD / import-export (LOX-1249)

MCP `loxtep_context` procedure ops map to `client.context.procedures` (graph
authored process maps — not process-intelligence discovery):

| MCP operation | SDK | REST | Status |
| --- | --- | --- | --- |
| `list_procedures` | `client.context.procedures.list({ … })` (alias `list_procedures`) | `GET /graph/organizations/{org}/procedures` | shipped |
| `get_procedure` | `.get(procedure_id)` (alias `get_procedure`) | `GET /graph/procedures/{procedure_id}` | shipped |
| `create_procedure` | `.create({ name, … })` (alias `create_procedure`) | `POST /graph/organizations/{org}/procedures` | shipped |
| `update_procedure` | `.update(procedure_id, { … })` (alias `update_procedure`) | `PUT /graph/procedures/{procedure_id}` | shipped |
| `delete_procedure` | `.delete(procedure_id)` (alias `delete_procedure`) | `DELETE /graph/procedures/{procedure_id}` | shipped |
| `import_process_graph` | `.import_process_graph({ graph \| s3_reference, … })` | `POST /graph/organizations/{org}/procedures/import` | shipped |
| `export_process_graph` | `.export_process_graph({ procedure_id, format?, preserve_namespaces? })` | `GET /graph/procedures/{procedure_id}/export` | shipped |

Notes:

- `organization_id` comes from the client constructor or per-call override for
  org-scoped routes (`list` / `create` / `import_process_graph`).
- Import requires exactly one of `graph` (inline JSON-LD) or `s3_reference`.
- Export `format`: `jsonld` (default) \| `yaml` \| `summary`.
- Out of this ticket's acceptance set (still MCP-only): `get_procedure_dependencies`.

Full MCP operation tables: [loxtep-plugins-skills AGENTS.md](https://github.com/LoxtepInc/loxtep-plugins-skills/blob/main/AGENTS.md).
