# MCP tools vs SDK (Phase D namespace alignment)

This is a **guide for agents**, not an exhaustive operation listing. Agents use
the hosted MCP tools; scripts and services use the SDK, which adds **typed
methods** and the **stream data plane** for live I/O.

Hosted MCP exposes **11 tools**: ten job facades plus the MCP Apps-only
`loxtep_package_review` review card. The SDK exposes **10 namespaces** that
mirror the job facades, plus the
namespaces `client.governance` (policies and access requests) and
`client.entities` (projection inference). Old flat namespaces
(`data_products`, `workflows`, `connectors`, …) are **removed** — no
deprecation aliases. The package-review card is not an SDK namespace.

Current MCP-only operations also include delivery grant list/get/save/update,
organization ontology inference start/get/cancel/list/review, and
`emit_semantic_gap_candidate`; do not invent SDK methods for them.

| MCP facade | SDK namespace | Nested APIs / notes |
| --- | --- | --- |
| `loxtep_session` | `client.session` | `get_current_user`, `get_current_organization`, `logout` |
| `loxtep_connect` | `client.connect` | `.connectors.*`, `.templates.*` |
| `loxtep_workspace` | `client.workspace` | `.projects.*`, `.instances.*` (`list`/`get`/`create`; `get_stream_config` ↔ MCP `loxtep_observe` → `get_stream_config`, CLI `loxtep instances stream-config`). `.versions` (SDK pending — use MCP `loxtep_workspace` → `list_versions` / `create_snapshot` / `restore_version` / `compare_versions`); MCP `get_project_workspace_status` → `ProjectWorkspaceStatus` ([docs](./project-workspace-status.md)). **Resource:** `loxtep://workspace_context?project_id=<uuid>&instance_id=<uuid>` — design-time inventory for that project + Instance (CLI `loxtep whoami` prints the same pin; `loxtep attach` must match Studio). |
| `loxtep_build` | `client.build` | `.workflows.*`, `.triggers.*`, `.data_products.*` (includes `.semantic_inference.request/get/promote` and `.consumption_suggestions.request/get/decide` ↔ `request_/get_consumption_method_suggestions`, `decide_consumption_method_suggestion`; CLI `loxtep delivery suggest|suggestions|accept|dismiss`), `.targets.*`, deploy writes, `.get_writer({ bot_id, queue })` escape hatch |
| `loxtep_define` | `client.define` | `.schemas.*` (data-product), `.shapes.*` (domain canonical shapes), `.quality.*`, `.quality_rules.*` (includes `.suggestions.request/get/decide` ↔ `request_/get_quality_rule_suggestions`, `decide_quality_rule_suggestion`; CLI `loxtep quality-rules suggest|suggestions|accept|dismiss`), `.standards.*`, `.data_contracts.*`, `.domains.*`, `.product_definition.*` (agent definition proposals). Policy CRUD and access requests are `client.governance`, not `define.standards`. |
| `loxtep_meaning` | `client.meaning` | `.thesaurus.*`, `.ontology.*` (includes `discover_ontology_relationships` / `accept_ontology_relationships`), `.packs.*`, `.semantic.*` (`apply_glossary_bindings`), `.proposals.*`, `.bundles.import` |
| `loxtep_review` | `client.review` | `.approvals.*`, `.improvements.*`, `.cdlc.*` (lifecycle, propagation, `list_artifacts`, `submit_for_review`, `list_review_queue` / `list_cdlc_review_queue`, `list_identity_clusters`, `approve_review`, `bridge_semantics`); `.mining.*` (`run_mining_pass`, `list_candidates`, `act_on_candidate`). CLI: `loxtep cdlc …`, `loxtep candidates list|act` |
| `loxtep_query` | `client.query` | `.catalog.*`, `.discovery.*`, `.query()`, `.list_tables()`, `.search()` |
| `loxtep_observe` | `client.observe` | `.status()`, `.stream_config()`, queue `.open_reader` / `.open_writer`, `.list_deployments()`, `.get_deployment()`, trust signals. Iceberg operations live on `client.build.data_products.iceberg`: `get_iceberg_health` ↔ `.health()`, `enable_iceberg_table` ↔ `.enable()`, `rebuild_iceberg_table` ↔ `.rebuild()`, `set_iceberg_history` ↔ `.set_history(id, enabled, { confirm })`, `set_iceberg_indexes` ↔ `.set_indexes(id, { analytics_indexes_enabled, bloom_filter_columns, row_embeddings })`, `trace_iceberg_event` ↔ `.trace(id, eid, { max_hops, max_rows })`. CLI `loxtep data-products iceberg health|enable|rebuild|history|indexes|trace` |
| `loxtep_context` | `client.context` | `.process_intelligence.*`, `.procedures.*`, `.activity.*`, `.issues.*`, `.goals.*`, `.workstreams.*` |
| — | `client.governance` | `.policies.*`, `.access_requests.*`. Not a hosted MCP facade name; the matching MCP operations are on `loxtep_define` (see Governance below). |
| — | `client.entities` | `.infer_projection` ↔ MCP `loxtep_meaning` → `infer_entity_projection` |

## Approvals fixture / env bootstrap

Happy-path **list_pending** + **resolve** (approve/reject) integration tests use the
CLI mock catalog — no live mcpdev required for the default suite:

| Mode | Bootstrap |
| --- | --- |
| **Fixtures (CI default)** | `src/cli/__tests__/mock-platform-api.ts` — mock approval-request catalog. Run: `pnpm exec jest src/client/approvals.http.integration.test.ts src/cli/cli-integration.test.ts src/cli/cli-integration-mutations.test.ts` |
| **Live staging/mcpdev (optional)** | `loxtep login` (writes credentials), set `api_url` / `organization_id` in config (or `LOXTEP_API_URL` / `LOXTEP_ORGANIZATION_ID`), then `LOXTEP_CLI_SMOKE=1 pnpm exec jest src/cli/cli-staging-smoke.test.ts` |

MCP mapping: `loxtep_review.list_pending` → `client.review.approvals.list_pending()`;
`loxtep_review.resolve` → `client.review.approvals.resolve(id, 'approve'\|'reject')`
(CLI: `loxtep approvals list|approve|reject`).

That inbox API decides a request. It does not create the step. Create the step
with `loxtep approval add --workflow <id> --after <entity-id> --name <name> --channel <channel> --timeout-hours <n>`,
or with `client.build.workflows.patch_graph(workflow_id, project_id, { operations })`
(`add_node` `entity_type: "approvals"` and `connect_nodes_labeled` label
`approved`). A new flow puts `approvals/{approval_node_id}.json` in
`save_workflow_bundle`. Python keeps `review.approvals` for the inbox decision.
The same JSON file is the Python authoring path. There is no Python
`defineDataWorkflow`.

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
probe uses `test_connector` / `loxtep connectors test <id>`; entity discovery uses
`list_connector_entities` / `loxtep connectors list-entities <id>`; sample capture uses
`capture_samples` / `loxtep connectors capture-samples <id> --entity-type <name>`.

When unsure: **MCP for provisioning and agent tool calls**; **SDK/CLI for runtime**.
Bus physical names (`LeoCron`, `LeoS3`, …): Node `loxtep instances stream-config`
or `client.workspace.instances.get_stream_config(id)` (Python same method). Not
MCP `list_instances` or `get_sdk_config`.

## Meaning: thesaurus / vocabulary (Phase 2)

MCP `loxtep_meaning` thesaurus ops map to `client.meaning.thesaurus`:

| MCP operation | SDK |
| --- | --- |
| `list_terms` | `client.meaning.thesaurus.list_terms()` |
| `get_term` | `.get_term(term_id)` |
| `create_term` | `.create_term({ canonical_key, aliases, … })` |
| `update_term` | `.update_term(term_id, { … })` |
| `delete_term` | `.delete_term(term_id)` |
| `sync_vocabulary` | `.sync_vocabulary({ domain, terms, mode, dry_run? })` |
| `create_enterprise_override` | `.create_enterprise_override({ canonical_key, enterprise_definition, divergence_reason, … })` |
| `resolve_canonical_key` | `.resolve_canonical_key(key_or_alias)` (resolved client-side over `list_terms`) |
| append synonym (SDK) | `.append_synonym(canonical_key, alias_path, …)` |

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

Ontology concepts are **graph types and relationships** between them. Defining
**meaning** for agents/stewards is primarily **terms** (`thesaurus`) + **shapes**
(`client.define.shapes`).

## Meaning: vocabulary packs (LOX-1242)

These ops live under MCP **`loxtep_meaning`** / semantic-layer (not `loxtep_define`).
SDK surface: `client.meaning.packs`. CLI: `loxtep packs …`.

| MCP operation | SDK |
| --- | --- |
| `list_available_packs` | `client.meaning.packs.list_available()` (alias `list_available_packs`) |
| `activate_vocabulary_pack` | `client.meaning.packs.activate({ pack_id, organization_id? })` (alias `activate_vocabulary_pack`) |
| `get_pack_activation_status` | `client.meaning.packs.get_activation_status()` (alias `get_pack_activation_status`) |

CLI verbs:

| CLI | SDK |
| --- | --- |
| `loxtep packs list` | `list_available()` |
| `loxtep packs activate <pack_id> [--organization-id]` | `activate({ pack_id, organization_id })` |
| `loxtep packs status` | `get_activation_status()` |

Notes:

- Activation status is normalized to snake_case (`activation_state`, `active_pack_id`, …) whether the graph handler returns camelCase or snake_case.
- `list_available` follows the same recommend path as the hosted MCP tool. If recommendations are unavailable, callers see that error. There is no separate pack-inventory call.
- Requires `catalog:read` for list/status and `admin:vocabulary` for activate (platform RBAC).

## Meaning: semantic search / completeness (LOX-1243)

MCP `loxtep_meaning` semantic-layer read ops map to `client.meaning.semantic`:

| MCP operation | SDK |
| --- | --- |
| `search_semantic_layer` | `client.meaning.semantic.search({ query, … })` (alias `search_semantic_layer`; string query shorthand OK) |
| `get_semantic_artifact` | `client.meaning.semantic.get_artifact({ artifact_type, id })` (alias `get_semantic_artifact`; `artifact_id` accepted) |
| `get_semantic_completeness` | `client.meaning.semantic.get_completeness({ domain_id? })` (alias `get_semantic_completeness`) |

Notes:

- Requires `catalog:read` (platform RBAC).
- The SDK methods do not go through MCP, so MCP-only enrichments (empty-search / completeness `metadata.activation_state` from pack activation) are not duplicated — use `client.meaning.packs.get_activation_status()` when needed.
- Pack lifecycle remains under `client.meaning.packs` (see vocabulary packs section above).

## Meaning: semantic proposals (Phase 2)

Agent review of the same inbox Meaning shows. Batch helpers fan out to
single-id accept / reject (no batch operation yet).

| Concern | MCP `loxtep_meaning` | SDK | CLI |
| --- | --- | --- | --- |
| list proposals | `list_semantic_proposals` | `client.meaning.proposals.list({ disposition?, proposal_type?, … })` | `loxtep proposals list` |
| infer definitions | `infer_proposal_definitions` | `.infer_definitions(ids)` | `loxtep proposals infer-definitions <id>…` |
| accept (+ optional definition) | `accept_semantic_proposal` | `.accept(id, { definition?, resolution_note? })` | `loxtep proposals accept <id> [--definition …]` |
| reject | `reject_semantic_proposal` | `.reject(id, { resolution_note? })` | `loxtep proposals reject <id>` |
| batch accept / reject | — | `.accept_batch` / `.reject_batch` (fans out to single-id accept / reject) | — |

Notes:

- Confidence on proposals is **business-field** score (Medium ≠ ready). Check
  `proposal_payload.definition` before accept; use Infer for missing drafts.
- Detection metadata on the payload is not a sample event and not the glossary
  definition.
## Meaning: semantic bundles + packages

| MCP operation | SDK |
| --- | --- |
| `import_semantic_bundle` | `client.meaning.bundles.import({ bundle, dry_run?, activation?, package_id? })` |
| `export_semantic_bundle` | `client.meaning.bundles.export({ …filters })` |
| `save_semantic_package` | `client.meaning.packages.save({ bundle, … })` |
| `plan_semantic_package` | `.plan({ package_id, revision })` |
| `approve_semantic_package` | `.approve({ package_id, revision, content_hash })` |
| `deploy_semantic_package` | `.deploy({ package_id, revision, content_hash })` |
| `verify_semantic_package` | `.verify({ package_id, revision, include_r2rml? })` |
| `get_semantic_package_status` | `.status({ package_id, revision? })` |
| `import_external_semantic_package` | `.import_external({ format, content, … })` |

Default import `activation` is `stage` (package revision + approval). Use
`activation: 'deploy'` only for legacy immediate apply. Phase 0 error contract:
result always includes `skipped_count` and `errors`. Staged / dry_run responses
are not treated as failures when plan skips exist.

## Meaning: glossary, relationships, semantic inference, entity projection

| MCP operation | SDK |
| --- | --- |
| `apply_glossary_bindings` | `client.meaning.semantic.apply_glossary_bindings({ data_product_id, mapping_revision? })` |
| `discover_ontology_relationships` | `client.meaning.ontology.discover_ontology_relationships({ limit? })` |
| `accept_ontology_relationships` | `client.meaning.ontology.accept_ontology_relationships({ relationships, data_product_id? })` |
| `request_semantic_inference` | `client.build.data_products.semantic_inference.request(id)` |
| `get_semantic_inference` | `.semantic_inference.get(id)` |
| `promote_semantic_inference` | `.semantic_inference.promote(id, { run_id, action, issue_id? })` |
| `infer_entity_projection` | `client.entities.infer_projection(entity_definition_id, { linked_data_product_ids? })` |

`emit_semantic_gap_candidate` remains MCP-only (no SDK method).

## Governance: policies and access requests

Standards stay on `client.define.standards`. `organization_id` for policies and
access requests comes from the client.

| MCP operation | SDK |
| --- | --- |
| `list_governance_policies` | `client.governance.policies.list({ page?, page_size?, search?, domain_id?, include_org_policies?, type? })` |
| `get_governance_policy` | `.get(policy_id)` |
| `create_governance_policy` | `.create({ name, rules, … })` |
| `update_governance_policy` | `.update(policy_id, partial)` |
| `delete_governance_policy` | `.delete(policy_id)` |
| `create_access_request` | `client.governance.access_requests.create({ resource_type, resource_id, access_type, justification?, metadata? })` |
| `list_access_requests` | `.list({ page?, page_size?, status?, resource_type?, resource_id? })` |
| `decide_access_request` | `.decide(access_request_id, { action, rejection_reason? })` |

`create` omits `type` when it is absent; the platform default is
`data_governance`.

## Build: query_trigger preview / run (D14)

MCP `loxtep_build` ops for enrichment SQL derivation (`workflow.json` →
`trigger.query_trigger`). SDK surface: `client.build.workflows`.

| MCP operation | SDK | CLI |
| --- | --- | --- |
| `preview_query_trigger` | `client.build.workflows.preview_query_trigger({ workflow_id, query?, primary_key?, limit? })` | `loxtep workflows preview-query-trigger --workflow-id <uuid> [--query] [--limit] [--primary-key a,b]` |
| `run_query_trigger` | `client.build.workflows.run_query_trigger({ workflow_id, query?, primary_key?, sink_data_product_id? })` | `loxtep workflows run-query-trigger --workflow-id <uuid> [--sink-data-product-id]` |

The SDK and CLI run these as hosted `loxtep_build` operations (no separate SDK
transport in this release). Requires a saved enrichment workflow with `trigger.query_trigger`.

## Define: domain shapes (Phase 2)

Domain / org **canonical shapes** (`domain_schemas`) — distinct from
`client.define.schemas` (data-product schema versions).

| MCP operation | SDK |
| --- | --- |
| `create_schema` | `client.define.shapes.create({ name, format, … })` |
| `list_schemas` | `.list({ domain_id?, format?, search? })` |
| `get_schema` (by `schema_id`) | `.get(schema_id)` |
| `apply_schema` | `.apply({ schema_id, data_product_id, schema_version_id? })` |
| `patch_schema` (align) | `.align({ schema_id, aligned_to_concept_uri })` |

MCP-only (no SDK yet): `update_schema`, `delete_schema`, `list_schema_versions`,
`unapply_schema`, `list_schema_applications`, `add_schema_version`,
`get_schema_impact`, `install_schema_pack`. Data-product PII tagging stays on
`client.define.schemas.tag_pii_fields`.

## Define: product definition proposals

Agent-authored shape / semantic binding proposals (approve ≠ apply). Skill:
`define-data-product-shape`. Procedure: `procedure#define-data-product-via-agent`.

SDK surface: `client.define.product_definition`. CLI: `loxtep define …`.

| MCP operation | SDK |
| --- | --- |
| `get_definition_status` | `.get_definition_status(data_product_id)` |
| `approve_definition_proposal` | `.approve_definition_proposal(id)` |
| `apply_definition_proposal` | `.apply_definition_proposal(id)` |
| `withdraw_definition_proposal` | `.withdraw_definition_proposal(id)` |
| `get_definition_evidence` | `.get_definition_evidence(data_product_id)` |
| `submit_shape_proposal` | `.submit_shape_proposal({ … })` |
| `revise_shape_proposal` | `.revise_shape_proposal({ … })` |
| `revise_semantic_bindings_proposal` | `.revise_semantic_bindings_proposal({ … })` |
| `get_definition_proposal` | `.get_definition_proposal(id)` |
| `list_definition_proposals` | `.list_definition_proposals({ … })` |
| `submit_semantic_bindings_proposal` | `.submit_semantic_bindings_proposal({ … })` |
| `run_definition_batch` | `.run_definition_batch({ data_product_ids, action? })` |
| `get_definition_skill` | `.get_definition_skill()` |
| `start_definition_procedure_run` | `.start_definition_procedure_run(data_product_id)` |

CLI verbs:

| CLI | SDK |
| --- | --- |
| `loxtep define status <dp>` | `get_definition_status` |
| `loxtep define evidence <dp>` | `get_definition_evidence` |
| `loxtep define list \| get <id>` | `list_definition_proposals` / `get_definition_proposal` |
| `loxtep define submit-shape <dp> --definition <json>` | `submit_shape_proposal` |
| `loxtep define submit-semantic <dp> [--definition <json>]` | `submit_semantic_bindings_proposal` |
| `loxtep define approve\|apply\|withdraw <id>` | `approve_definition_proposal` / `apply_definition_proposal` / `withdraw_definition_proposal` |
| `loxtep define skill` | `get_definition_skill` |
| `loxtep define start-procedure <dp>` | `start_definition_procedure_run` |
| `loxtep define batch --data-product-ids <csv>` | `run_definition_batch` |

## Review: CDLC + context mining (LOX-1244…1247)

MCP `loxtep_review` CDLC / mining ops map to `client.review.cdlc` and
`client.review.mining`:

| MCP operation | SDK |
| --- | --- |
| `get_artifact_lifecycle` | `client.review.cdlc.get_artifact_lifecycle({ artifact_ref })` |
| `transition_lifecycle` | `.transition_lifecycle({ artifact_ref, from_state, to_state, … })` |
| `propagate_change` | `.propagate_change({ … })` |
| `list_propagation_lineage` | `.list_propagation_lineage({ … })` |
| `list_context_dependencies` | `.list_context_dependencies({ … })` |
| `list_review_queue` | `.list_review_queue({ … })` |
| `list_cdlc_review_queue` | `.list_cdlc_review_queue({ … })` |
| `list_artifacts` | `.list_artifacts({ lifecycle_state?, scope?, artifact_type?, owner?, domain_id? })` |
| `submit_for_review` | `.submit_for_review({ artifact_refs })` |
| `list_identity_clusters` | `.list_identity_clusters()` |
| `approve_review` | `.approve_review({ task_id })` |
| `bridge_semantics` | `.bridge_semantics({ data_product_id })` |
| `run_mining_pass` | `client.review.mining.run_mining_pass({ … })` |
| `list_candidates` | `.list_candidates({ … })` |
| `act_on_candidate` | `.act_on_candidate(candidate_id, { action, … })` |

CLI: `loxtep cdlc transition`, `loxtep cdlc review-queue`,
`loxtep candidates list`, `loxtep candidates act`.

## Context: decision traces causal / similar (LOX-1248)

MCP `loxtep_context` process-intelligence decision-trace ops map to
`client.context.process_intelligence.decisionTraces`:

| MCP operation | SDK |
| --- | --- |
| `list_decision_traces` | `.decisionTraces.list(org, { … })` |
| `record_decision_trace` (optional links / precedent) | `.decisionTraces.create(org, { … })` |
| causal chain — no MCP op (SDK only) | `.decisionTraces.getChain(org, trace_id, { … })` |
| similar decisions — no MCP op (SDK only) | `.decisionTraces.getSimilar(org, trace_id, { … })` |

Also: `client.context.process_intelligence.getEntityContext(org, { entity_type, entity_id })`.

## Context: procedures CRUD / import-export (LOX-1249)

MCP `loxtep_context` procedure ops map to `client.context.procedures` (graph
authored process maps — not process-intelligence discovery):

| MCP operation | SDK | Status |
| --- | --- | --- |
| `list_procedures` | `client.context.procedures.list({ … })` (alias `list_procedures`) | shipped |
| `get_procedure` | `.get(procedure_id)` (alias `get_procedure`) | shipped |
| `create_procedure` | `.create({ name, … })` (alias `create_procedure`) | shipped |
| `update_procedure` | `.update(procedure_id, { … })` (alias `update_procedure`) | shipped |
| `delete_procedure` | `.delete(procedure_id)` (alias `delete_procedure`) | shipped |
| `import_process_graph` | `.import_process_graph({ graph \| s3_reference, … })` | shipped |
| `export_process_graph` | `.export_process_graph({ procedure_id, format?, preserve_namespaces? })` | shipped |

Notes:

- `organization_id` comes from the client constructor or per-call override for
  org-scoped calls (`list` / `create` / `import_process_graph`).
- Import requires exactly one of `graph` (inline JSON-LD) or `s3_reference`.
- Export `format`: `jsonld` (default) \| `yaml` \| `summary`.
- Out of this ticket's acceptance set (still MCP-only): `get_procedure_dependencies`.

## Context: agent workspace issues / goals / workstreams (LOX-1250)

MCP `loxtep_context` agent-orchestration **reads** map to
`client.context.issues` / `.goals` / `.workstreams`:

| MCP operation | SDK | Status |
| --- | --- | --- |
| `list_issues` | `client.context.issues.list({ … })` (alias `list_issues`) | shipped |
| `get_issue` | `.get(issue_id)` (alias `get_issue`) | shipped |
| `create_issue` | `.create({ … })` (alias `create_issue`); client-side `dedupe_key` | shipped |
| `list_goals` | `client.context.goals.list({ … })` (alias `list_goals`) | shipped |
| `get_goal` | `.get(goal_id)` (alias `get_goal`) | shipped |
| `list_workstreams` | `client.context.workstreams.list({ … })` (alias `list_workstreams`) | shipped |
| `get_workstream` | `.get(workstream_id)` (alias `get_workstream`) | shipped |

**Writes deferred** (still MCP-only): `update_issue`,
`add_issue_comment`, `create_goal`, `create_workstream`, `update_workstream`.
Also out of this ticket: `list_agents` / `get_agent`.

### Connect: local MCP discovery (loxtep#4801)

Not an MCP facade op — local IDE config import on the agent/CLI host:

| SDK | Notes |
| --- | --- |
| `client.connect.discovery.discoverLocalMcps({ sources?, include_stdio? })` | Cursor / Claude / Codex / VS Code / mcporter configs |
| `client.connect.discovery.proposeConnectors(discovered?)` | dispositions: create / map_existing / action_only / skip |
| `client.connect.discovery.discoverAndPropose({ apply?, open_auth_issues?, … })` | Library default `apply: false`; `--apply` creates `pending_auth` + auth issues |

CLI: `loxtep connect discover` (dry-run), `loxtep connect discover --apply`.
`--apply` creates connectors only for **first-party** type maps (Shopify, GitHub,
…). Generic HTTP/SSE MCPs apply as platform `mcp-http` (never `rest-api`).
Disable with `LOXTEP_MCP_HTTP_APPLY=0`. Never copies IDE vault tokens.

Notes:

- `organization_id` from the client constructor or per-call override on list calls.
- Issue list filters: `workstream_id`, `goal_id`, `status`, `assignee_agent_id`,
  `page`, `page_size`. Goals/workstreams lists accept `page` / `page_size`.

Full MCP operation tables: [loxtep-plugins-skills AGENTS.md](https://github.com/LoxtepInc/loxtep-plugins-skills/blob/main/AGENTS.md).
