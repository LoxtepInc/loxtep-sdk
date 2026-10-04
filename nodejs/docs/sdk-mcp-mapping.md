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
| `loxtep_workspace` | `client.workspace` | `.projects.*`, `.instances.*` (`list`/`get`/`create`; **`get_stream_config` is REST/CLI only** — not an MCP op). `.versions` (REST pending); planned MCP `get_project_workspace_status` → `ProjectWorkspaceStatus` ([docs](./project-workspace-status.md)) |
| `loxtep_build` | `client.build` | `.workflows.*`, `.triggers.*`, `.data_products.*`, `.targets.*`, deploy writes, `.get_writer({ bot_id, queue })` escape hatch |
| `loxtep_define` | `client.define` | `.schemas.*` (data-product), `.shapes.*` (domain canonical shapes), `.quality.*`, `.standards.*`, `.data_contracts.*`, `.domains.*`, `.product_definition.*` (agent definition proposals) |
| `loxtep_meaning` | `client.meaning` | `.thesaurus.*`, `.ontology.*`, `.packs.*`, `.semantic.*`, `.proposals.*`, `.bundles.import` |
| `loxtep_review` | `client.review` | `.approvals.*`, `.improvements.*`, `.cdlc.*` (get/transition/propagate/lineage/deps + `list_review_queue`); `.mining.*` (`run_mining_pass`, `list_candidates`, `act_on_candidate`). CLI: `loxtep cdlc …`, `loxtep candidates list|act` |
| `loxtep_query` | `client.query` | `.catalog.*`, `.discovery.*`, `.query()`, `.list_tables()`, `.search()` |
| `loxtep_observe` | `client.observe` | `.status()`, `.stream_config()`, queue `.open_reader` / `.open_writer`, `.list_deployments()`, `.get_deployment()`, trust signals |
| `loxtep_context` | `client.context` | `.process_intelligence.*`, `.procedures.*`, `.activity.*`, `.issues.*`, `.goals.*`, `.workstreams.*` |

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

When unsure: **MCP for provisioning and agent tool calls**; **SDK/CLI for runtime**.
Bus physical names (`LeoCron`, `LeoS3`, …): Node `loxtep instances stream-config`
or `client.workspace.instances.get_stream_config(id)` (Python same method). Not
MCP `list_instances` or `get_sdk_config`.

## Meaning: thesaurus / vocabulary (Phase 2)

MCP `loxtep_meaning` thesaurus ops map to `client.meaning.thesaurus`:

| MCP operation | SDK | REST |
| --- | --- | --- |
| `list_terms` | `client.meaning.thesaurus.list_terms()` | `GET /graph/organizations/{org}/thesaurus` |
| `get_term` | `.get_term(term_id)` | `GET …/thesaurus/{term_id}` |
| `create_term` | `.create_term({ canonical_key, aliases, … })` | `POST …/thesaurus` |
| `update_term` | `.update_term(term_id, { … })` | `PUT …/thesaurus/{term_id}` |
| `delete_term` | `.delete_term(term_id)` | `DELETE …/thesaurus/{term_id}` |
| `sync_vocabulary` | `.sync_vocabulary({ domain, terms, mode, dry_run? })` | `POST …/thesaurus/sync` |
| `create_enterprise_override` | `.create_enterprise_override({ canonical_key, enterprise_definition, divergence_reason, … })` | `POST …/thesaurus` (`is_override: true`) |
| `resolve_canonical_key` | `.resolve_canonical_key(key_or_alias)` | client-side over `list_terms` |
| append synonym (SDK) | `.append_synonym(canonical_key, alias_path, …)` | `POST …/thesaurus/synonyms` |

MCP-only (no SDK yet): `list_enterprise_overrides`, `resolve_semantic_gap`,
namespace-mapping CRUD (`register_namespace_mapping`, `list_namespace_mappings`,
`get_namespace_mapping`).

## Meaning: ontology concepts (LOX-1241)

MCP `loxtep_meaning` ontology ops map to `client.meaning.ontology`.
`node_type` is a **lowercase** enum: `entity` \| `microservice` \| `taxonomy` \|
`pattern` \| `custom` (not `Entity`).

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

Ontology concepts are **graph types and relationships** between them. Defining
**meaning** for agents/stewards is primarily **terms** (`thesaurus`) + **shapes**
(`client.define.shapes`).

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

## Meaning: semantic proposals (Phase 2)

Agent review of the same inbox Meaning shows. Batch helpers fan out to the
single-id PUT (no dedicated batch REST).

| Concern | SDK | REST |
| --- | --- | --- |
| list proposals | `client.meaning.proposals.list({ disposition?, proposal_type?, … })` | `GET /semantic-layer/semantic-proposals` |
| accept | `.accept(semantic_proposal_id, { resolution_note? })` | `PUT …/semantic-proposals/{id}` `disposition: accepted` |
| reject | `.reject(semantic_proposal_id, { resolution_note? })` | `PUT …` `disposition: rejected` |
| batch accept / reject | `.accept_batch` / `.reject_batch` | N× PUT |

## Meaning: semantic bundles + packages

| MCP operation | SDK | REST |
| --- | --- | --- |
| `import_semantic_bundle` | `client.meaning.bundles.import({ bundle, dry_run?, activation?, package_id? })` | `POST /semantic-layer/bundles/import` |
| `export_semantic_bundle` | `client.meaning.bundles.export({ …filters })` | `GET /semantic-layer/bundles/export` |
| `save_semantic_package` | `client.meaning.packages.save({ bundle, … })` | `POST /semantic-layer/packages` `action=save` |
| `plan_semantic_package` | `.plan({ package_id, revision })` | `action=plan` |
| `approve_semantic_package` | `.approve({ package_id, revision, content_hash })` | `action=approve` |
| `deploy_semantic_package` | `.deploy({ package_id, revision, content_hash })` | `action=deploy` |
| `verify_semantic_package` | `.verify({ package_id, revision, include_r2rml? })` | `action=verify` |
| `get_semantic_package_status` | `.status({ package_id, revision? })` | `action=status` |
| `import_external_semantic_package` | `.import_external({ format, content, … })` | `action=import_external` |

Default import `activation` is `stage` (package revision + approval). Use
`activation: 'deploy'` only for legacy immediate apply. Phase 0 error contract:
result always includes `skipped_count` and `errors`. Staged / dry_run responses
are not treated as failures when plan skips exist.

## Define: domain shapes (Phase 2)

Domain / org **canonical shapes** (`domain_schemas`) — distinct from
`client.define.schemas` (data-product schema versions on `/dataproducts`).

| MCP operation | SDK | REST |
| --- | --- | --- |
| `create_schema` | `client.define.shapes.create({ name, format, … })` | `POST /semantic-layer/schemas` |
| `list_schemas` | `.list({ domain_id?, format?, search? })` | `GET /semantic-layer/schemas` |
| `get_schema` (by `schema_id`) | `.get(schema_id)` | `GET /semantic-layer/schemas/{schema_id}` |
| `apply_schema` | `.apply({ schema_id, data_product_id, schema_version_id? })` | `POST …/schemas/{schema_id}/applications` |
| `patch_schema` (align) | `.align({ schema_id, aligned_to_concept_uri })` | `PUT …/schemas/{schema_id}` |

MCP-only (no SDK yet): `update_schema`, `delete_schema`, `list_schema_versions`,
`unapply_schema`, `list_schema_applications`, `add_schema_version`,
`get_schema_impact`, `install_schema_pack`. Data-product PII tagging stays on
`client.define.schemas.tag_pii_fields`.

## Define: product definition proposals

Agent-authored shape / semantic binding proposals (approve ≠ apply). Skill:
`define-data-product-shape`. Procedure: `procedure#define-data-product-via-agent`.

SDK surface: `client.define.product_definition`. CLI: `loxtep define …`.

| MCP operation | SDK | Transport |
| --- | --- | --- |
| `get_definition_status` | `.get_definition_status(data_product_id)` | `GET /semantic-layer/product-definition?data_product_id=` |
| `approve_definition_proposal` | `.approve_definition_proposal(id)` | `POST /semantic-layer/product-definition` `{ action: 'approve', … }` |
| `apply_definition_proposal` | `.apply_definition_proposal(id)` | `POST …` `{ action: 'apply', … }` |
| `withdraw_definition_proposal` | `.withdraw_definition_proposal(id)` | `POST …` `{ action: 'withdraw', … }` |
| `get_definition_evidence` | `.get_definition_evidence(data_product_id)` | MCP `loxtep_define` |
| `submit_shape_proposal` | `.submit_shape_proposal({ … })` | MCP `loxtep_define` |
| `revise_shape_proposal` | `.revise_shape_proposal({ … })` | MCP `loxtep_define` |
| `revise_semantic_bindings_proposal` | `.revise_semantic_bindings_proposal({ … })` | MCP `loxtep_define` |
| `get_definition_proposal` | `.get_definition_proposal(id)` | MCP `loxtep_define` |
| `list_definition_proposals` | `.list_definition_proposals({ … })` | MCP `loxtep_define` |
| `submit_semantic_bindings_proposal` | `.submit_semantic_bindings_proposal({ … })` | MCP `loxtep_define` |
| `run_definition_batch` | `.run_definition_batch({ data_product_ids, action? })` | MCP `loxtep_define` |
| `get_definition_skill` | `.get_definition_skill()` | MCP `loxtep_define` |
| `start_definition_procedure_run` | `.start_definition_procedure_run(data_product_id)` | MCP `loxtep_define` |

CLI verbs:

| CLI | SDK |
| --- | --- |
| `loxtep define status <dp>` | `get_definition_status` |
| `loxtep define evidence <dp>` | `get_definition_evidence` |
| `loxtep define list \| get <id>` | `list_definition_proposals` / `get_definition_proposal` |
| `loxtep define submit-shape <dp> --definition <json>` | `submit_shape_proposal` |
| `loxtep define submit-semantic <dp> [--definition <json>]` | `submit_semantic_bindings_proposal` |
| `loxtep define approve\|apply\|withdraw <id>` | matching REST actions |
| `loxtep define skill` | `get_definition_skill` |
| `loxtep define start-procedure <dp>` | `start_definition_procedure_run` |
| `loxtep define batch --data-product-ids <csv>` | `run_definition_batch` |

## Review: CDLC + context mining (LOX-1244…1247)

MCP `loxtep_review` CDLC / mining ops map to `client.review.cdlc` and
`client.review.mining`:

| MCP operation | SDK | REST |
| --- | --- | --- |
| `get_artifact_lifecycle` | `client.review.cdlc.get_artifact_lifecycle({ artifact_ref })` | `GET /graph/organizations/{org}/cdlc/artifacts/{artifact_ref}` |
| `transition_lifecycle` | `.transition_lifecycle({ artifact_ref, from_state, to_state, … })` | `POST …/cdlc/artifacts/{artifact_ref}/transition` |
| `propagate_change` | `.propagate_change({ … })` | `POST …/cdlc/propagate` |
| `list_propagation_lineage` | `.list_propagation_lineage({ … })` | `GET …/cdlc/propagation-lineage` |
| `list_context_dependencies` | `.list_context_dependencies({ … })` | `GET …/cdlc/dependencies` |
| `list_review_queue` | `.list_review_queue({ … })` | `GET …/cdlc/review-queue` |
| `run_mining_pass` | `client.review.mining.run_mining_pass({ … })` | `POST …/mining/run` |
| `list_candidates` | `.list_candidates({ … })` | `GET …/mining/candidates` |
| `act_on_candidate` | `.act_on_candidate(candidate_id, { action, … })` | `POST …/mining/candidates/{id}/act` |

CLI: `loxtep cdlc transition`, `loxtep cdlc review-queue`,
`loxtep candidates list`, `loxtep candidates act`.

## Context: decision traces causal / similar (LOX-1248)

MCP `loxtep_context` process-intelligence decision-trace ops map to
`client.context.process_intelligence.decisionTraces`:

| MCP / REST concern | SDK | REST |
| --- | --- | --- |
| list decision traces | `.decisionTraces.list(org, { … })` | `GET …/decision-traces` |
| create (optional links / precedent) | `.decisionTraces.create(org, { … })` | `POST …/decision-traces` |
| causal chain | `.decisionTraces.getChain(org, trace_id, { … })` | `GET …/decision-traces/{id}/chain` |
| similar decisions | `.decisionTraces.getSimilar(org, trace_id, { … })` | `GET …/decision-traces/{id}/similar` |

Also: `client.context.process_intelligence.getEntityContext(org, { entity_type, entity_id })`.

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

## Context: agent workspace issues / goals / workstreams (LOX-1250)

MCP `loxtep_context` agent-orchestration **reads** map to
`client.context.issues` / `.goals` / `.workstreams`:

| MCP operation | SDK | REST | Status |
| --- | --- | --- | --- |
| `list_issues` | `client.context.issues.list({ … })` (alias `list_issues`) | `GET /agent-orchestration/organizations/{org}/issues` | shipped |
| `get_issue` | `.get(issue_id)` (alias `get_issue`) | `GET /agent-orchestration/issues/{issue_id}` | shipped |
| `list_goals` | `client.context.goals.list({ … })` (alias `list_goals`) | `GET /agent-orchestration/organizations/{org}/goals` | shipped |
| `get_goal` | `.get(goal_id)` (alias `get_goal`) | `GET /agent-orchestration/goals/{goal_id}` | shipped |
| `list_workstreams` | `client.context.workstreams.list({ … })` (alias `list_workstreams`) | `GET /agent-orchestration/organizations/{org}/workstreams` | shipped |
| `get_workstream` | `.get(workstream_id)` (alias `get_workstream`) | `GET /agent-orchestration/workstreams/{workstream_id}` | shipped |

**Writes deferred** (still MCP-only): `create_issue`, `update_issue`,
`add_issue_comment`, `create_goal`, `create_workstream`, `update_workstream`.
Also out of this ticket: `list_agents` / `get_agent`.

Notes:

- `organization_id` from the client constructor or per-call override on list routes.
- Issue list filters: `workstream_id`, `goal_id`, `status`, `assignee_agent_id`,
  `page`, `page_size`. Goals/workstreams lists accept `page` / `page_size`.

Full MCP operation tables: [loxtep-plugins-skills AGENTS.md](https://github.com/LoxtepInc/loxtep-plugins-skills/blob/main/AGENTS.md).
