# Changelog

All notable changes to `loxtep` (Python SDK) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.1] — 2026-08-10

### Added

- **Agent workspace reads** — `IssuesApi` / `GoalsApi` / `WorkstreamsApi`
  (sync + async) on `client.context.issues|goals|workstreams` for
  `list`/`get` (MCP aliases `list_issues`/`get_issue`, etc.) against
  `/agent-orchestration/...`. **Writes deferred** — use MCP `loxtep_context`.
- **Decision-trace causal / similar (LOX-1226)** —
  `decision_traces_get_chain`, `decision_traces_get_similar`, and
  create-with-links on process-intelligence (sync + async).

## [0.6.0] — 2026-08-07

### Added

- **Deployments API** — `DeploymentsApi` / `AsyncDeploymentsApi` (`list`, `get`,
  `pick_latest_deployment`). Wired on `client.workspace.deployments` and
  `client.observe.list_deployments` / `get_deployment` (Node 0.9.x parity).
- **Approvals API** — real `ApprovalsApi` replaces `ApprovalsApiStub`
  (`list`, `list_pending`, `approve`, `reject`, `resolve`) via
  `/agent-orchestration/organizations/{org}/approval-requests`.
- **`connectors.capture_samples`** — POST `…/capture-samples` (sync + async).
- **`project_workspace_status`** — pure `build_project_workspace_status` /
  `derive_next_action` / `format_project_workspace_status_lines` helpers.
  Full unpublished FS inventory remains on the Node CLI path (Python CLI still
  delegates lifecycle commands via `npx`).

## [0.5.1] — 2026-08-03

### Fixed

- **`config export --from-connector` tests** mock `client.connect.connectors.get`
  (the facade path the CLI uses), so connector type / sdk_config assertions work.
- **Ruff** — pin an explicit lint `select` in `pyproject.toml` and drop unused
  imports so CI is not at the mercy of unconfigured `ruff` default-rule churn.

## [0.5.0] — 2026-07-28

### Added

- **`LoxtepClient.from_workspace()` / `AsyncLoxtepClient.from_workspace()`** —
  port of Node `fromWorkspace()`: env > explicit kwargs > `.loxtep/project.json`
  + credentials (project-local then `~/.loxtep`). Loads `region` and `streams`
  from attach so `get_writer` works without manual `LEO_*` env.
- **`loxtep.workspace_config`** — `load_workspace_config` / `resolve_auto_config` /
  `require_auto_config`.
- **Docs** — [sdk-first-ingest.md](docs/sdk-first-ingest.md) (Python app write path;
  Node CLI for lifecycle).

### Changed

- **`require_auto_config()`** — validation errors for missing `api_url` / token live in
  `workspace_config` (shared by sync + async `from_workspace`).
- **Shared fixtures** — `from_workspace` / workspace_config tests load
  `shared/fixtures/workspace/` so Node and Python stay on the same attach contract.

## [0.4.0] — Bug-fix parity with Node.js SDK

Ports the fixes made to the Node.js SDK (`@loxtep/sdk` 0.7.24–0.7.29) in response to
end-to-end testing that found several critical/high bugs.

(Most of this shipped as `0.2.0`; the Leo→Loxtep stream-class rename below landed after
that release and is new in `0.4.0`. Versions `0.2.0`/`0.3.0` are otherwise skipped here —
see the historical entries further down for unrelated, long-superseded `0.1.0`–`0.3.0`
"Unreleased" drafts from an earlier `delivery`/`consumptions` namespace design that never
shipped under those numbers.)

### Fixed

- **Critical — gateway URL routing.** Added `loxtep.gateway_url.build_platform_request_url`
  (port of `nodejs/src/config/platform-request-url.ts`) and wired it into
  `LoxtepHttpClient`/`AsyncLoxtepHttpClient` (on by default via
  `use_platform_path_resolution=True`). Fixes `/dataproducts` routes not being prefixed
  correctly against the shared gateway host, while correctly *not* doubling sibling
  resources (`datacontracts`, `quality-metrics`, `templates`, `warehouse`, etc.) and
  preserving query strings.
- **High — error detail swallowing.** `parse_http_error` now extracts messages/details
  from the nested `{success, error: {...}}` platform envelope, prefers a concrete string
  `details` over generic titles like "Validation Error", and reads `field_errors` from
  `field_errors`, `error.field_errors`, or `errors` (with `field`/`path` fallback for the
  field name) instead of only a bare top-level `field_errors` array.
- **High — stale triggers/targets routes.** `TriggersApi`/`TargetsApi` (sync + async)
  rewritten onto the project entities API
  (`/workflows/projects/{project_id}/entities/connections/...`), matching
  `nodejs/src/client/triggers.ts`/`targets.ts`. The old `/workflows/connections` and
  `/dataproducts/{id}/consumptions` routes were removed on the backend. **Breaking:**
  `Target` model fields changed from the `consumptions`-table shape
  (`consumption_id`, `target_type`/`delivery_type`, `is_active`, `endpoint_url`, ...) to
  the connection-entity shape (`connection_id`, `type`, `direction`, `verified`,
  `draft`, ...); both APIs now require `project_id` (and `workflow_id` for `create`).
  Added a parallel `Trigger` model.
- **Medium — data_products warehouse routes.** `query()`/`list_tables()` moved off the
  API-key-only `/dataproducts/query` / `/dataproducts/{id}/tables` onto the JWT-compatible
  `/dataproducts/warehouse/execute` / `/dataproducts/warehouse/tables`, matching
  `nodejs/src/client/data-products.ts`.
- **Critical — SDK ingest bundle missing `template_id`.** Added
  `loxtep.sdk_ingest_bundle` (port of `nodejs/src/lib/sdk-ingest-bundle.ts`):
  `build_sdk_ingest_bundle`/`build_sdk_ingest_local_package` now set
  `template_id=SDK_INGEST_TEMPLATE_ID` on the generated workflow entity, which the
  backend's `save_workflow_bundle` schema requires.
- **Medium — headless login environment.** `load_config()`/`load_credentials()` now
  read `api_base_url` from `credentials.json` as an `api_url` fallback (env → config
  file → credentials `api_base_url`), matching Node's `resolveCliApiUrl` precedence —
  previously a dev/staging login's target host was silently lost, and later calls fell
  back to the production default.
- **Medium — local-first credentials resolution.** `load_credentials()`/
  `get_token_from_env_or_file()`/`load_config()` now accept an optional `cwd` and walk
  up from it for a project-local `.loxtep/credentials.json` before falling back to the
  global `~/.loxtep/credentials.json`, matching Node's `resolveCredentialsPath`
  (`nodejs/src/cli/credentials.ts`). Previously Python only ever read the global file,
  so a project-scoped `loxtep login` (no `--global`, the Node CLI default) was silently
  ignored by every Python-side command run from that project.
- **Codegen parity (`loxtep generate`).** Added a native Python `generate` command
  (`codegen.py`, `project_context.py`) that emits `.loxtep/generated/__init__.py`
  (typed `DATA_PRODUCTS`/`CONNECTORS`/`DOMAINS`/`QUEUES`/`FLOWS`/`WORKFLOWS`/`WORKSPACE`
  dict constants) instead of delegating to the Node CLI, which would otherwise write a
  TypeScript file (`.loxtep/generated/index.ts`) into a Python project. Ports
  `nodejs/src/codegen/{load-workspace-context,normalize,emit,write-artifact}.ts` and the
  attached-project precondition from `nodejs/src/cli/project-context.ts` — the first time
  Python's CLI reads `.loxtep/project.json` at all (every other command previously relied
  solely on global config/env).
- **High — workflow creation.** `WorkflowsApi.create()`/`AsyncWorkflowsApi.create()` now
  require `workflow_type` and `domain_id` (the backend 500s with a raw DB error without
  them), matching `nodejs/src/client/flow-types.ts` `FlowCreateInput`.
- **High — deploy visibility.** Added `ProjectsApi.reindex()`/`AsyncProjectsApi.reindex()`
  (`POST /workflows/projects/:id/reindex`) — required after saving a workflow bundle and
  before `deploy` will see the new entities; the deploy path reads from an index table
  that a bundle save alone doesn't refresh.
- **CLI parity.** `loxtep` (Python CLI) now delegates any command it doesn't natively
  implement to the canonical Node.js CLI (`npx loxtep ...`) instead of failing with an
  "invalid choice" error — covers `ingest`, `deploy`, `transform`, `push`, `delivery`,
  `workflows create`, and everything else Node's CLI supports that Python's thin native
  command set (`query`, `stream`, `replay`, `workflows list/deploy`, `observe status`,
  `projects`, `templates`, `config export`) doesn't reimplement. One CLI implementation,
  not one per language — matches the existing `login` delegation pattern.
- **Breaking — removed "Leo" branding from public stream classes.** `LeoStreamWriter` →
  `LoxtepStreamWriter`, `AsyncLeoStreamWriter` → `AsyncLoxtepStreamWriter`,
  `LeoStreamReader` → `LoxtepStreamReader`, `AsyncLeoStreamReader` →
  `AsyncLoxtepStreamReader` (`loxtep.rstreams`, and the classes actually returned by
  `get_writer()`/`get_reader()`). "Leo" is the name of the internal streaming engine
  (leo-sdk/rStreams) the platform's event bus is built on — an implementation detail
  that had leaked into customer-visible type names/error messages. Matches the Node.js
  SDK's own convention of exporting `LoxtepStreamRuntime`, not `LeoStreamRuntime`, while
  keeping the internal module still named `rstreams`. Real backend resource/env-var
  names that legitimately use "Leo" (`LEO_*` env vars, the `LeoStream`/`LeoCron`/etc.
  DynamoDB table names in `StreamConfig`, the `storage.rstreams_queue` API field) are
  unaffected — those are wire-format contracts, not SDK branding.

## [Unreleased] — API surface redesign (parity with Node.js SDK)

Clean breaks (no deprecated aliases). Mirrors the Node.js SDK redesign so both
SDKs present the same surface, names, and journey grouping.

### Breaking changes

- **`flows` merged into `workflows`** — `client.flows` removed. Use
  `client.workflows` (`list`, `get`, `create`, `get_graph`, `deploy`,
  `get_writer`). `get_writer` is a low-level escape hatch (internal); prefer
  `data_products.get_writer`.
- **`connections` → `triggers`** — ingest source bindings.
- **`delivery` → `targets`** — delivery sink bindings. Model `DeliveryInterface`
  → `Target`, `DeliveryType` → `TargetType`, field `delivery_type` →
  `target_type` (the wire field stays `delivery_type` via a pydantic alias).
  `DeliveryApi`/`AsyncDeliveryApi` → `TargetsApi`/`AsyncTargetsApi`.
- **Short method names** for cross-language parity:
  `workflows.list_workflows→list`, `get_workflow_graph→get_graph`,
  `create_workflow→create`; `projects.list_projects→list`, `get_project→get`,
  `create_project→create`, `update_project→update`, `delete_project→delete`;
  `templates.list_templates→list`, `get_template→get`;
  `data_products.create_data_product→create`; `discovery.run_discovery→run`.
- **`process_intelligence`** de-emphasized to experimental (parity with Node).

### Added (Node.js parity)

- `data_products`: `get_writer`, `get_reader` (resolve name→id, HTTP data path),
  `get_lexicon`, `readiness`, `promote`, `invalidate_cache`.
- `schemas`: `list`, `tag_pii_fields`. `quality`: `create`.
- `projects`: `repository`. `instances`: `get_stream_config`.
- New `thesaurus` namespace (`list_terms`, `resolve_canonical_key`,
  `append_synonym`).
- Internal `improvements` (`list`/`apply`/`reject`) and `activity` (`list`)
  namespaces (excluded from the documented surface, matching Node).
- `domains`, `standards`, `data_contracts` are now real HTTP-backed namespaces
  (previously stubs). `data_contracts` gains `create`/`update`/`delete`.
  (`metrics` remains a no-op, matching Node.)
- **Native `loxtep.rstreams` stream data-plane module** (no external Leo SDK
  dependency): `resolve_stream_config` + `LeoStreamWriter` (Kinesis producer —
  gzipped NDJSON envelopes, batching, retry). `data_products.get_writer` and
  `workflows.get_writer` (sync) produce to the bus when `streams=` config (or
  `LEO_*` env) is present and `boto3` is installed (`pip install loxtep[streams]`),
  else HTTP fallback.
- **rstreams read path**: `LeoStreamReader` (LeoEvent/LeoCron bootstrap →
  LeoStream range query → inline-gzip/S3 NDJSON → per-event eid reconstruction →
  cursor advance), with optional **LeoCron checkpoint persistence**
  (`auto_checkpoint=` / `reader.checkpoint()`).
- **Async bus I/O**: `AsyncLeoStreamWriter`/`AsyncLeoStreamReader` (sync boto3 run
  via `asyncio.to_thread`); async `data_products.get_writer`/`get_reader` and
  `workflows.get_writer` use the bus when configured, else HTTP.
- **Large-payload S3 write-offload**: events whose JSON exceeds 600 KiB are
  uploaded to S3 as gzipped NDJSON and replaced on Kinesis with the leo-sdk
  S3-pointer chunk record (`{event, start, end, s3, offsets, gzipSize, size,
  records, stats, correlations}`); requires an S3 bucket in stream config.
- Remaining rstreams follow-ups (perf/edge only): S3 byte-range fast-read,
  snapshot/archive queue transitions.

## [0.3.0] - Unreleased

### Terminology Migration

The SDK now uses "delivery" terminology as the primary interface, replacing the
overloaded "consumption" vocabulary. This aligns the SDK with the platform UI,
documentation, and MCP tool names.

**Namespace rename:** `consumptions` → `delivery`

```python
# Use the delivery namespace
interfaces = client.data_products.delivery.list(dp_id)
```

**Type:** `DeliveryInterface`

```python
from loxtep.models import DeliveryInterface
```

**`delivery_type` field on `DeliveryInterface`:**

```python
webhook = DeliveryInterface(
    id="di_...",
    delivery_type="webhook",
    endpoint_url="https://example.com/hook",
    method="POST",
)
```

The old `consumptions` namespace and `Consumption` model have been removed.

### New features

- **`data_products.delivery` namespace** — Primary namespace for managing delivery
  interfaces with `list()`, `create()`, `update()`, and `delete()` methods.
- **`DeliveryInterface` model** — Includes a `delivery_type` discriminator field
  (`'webhook' | 'api_endpoint' | 'export' | 'database_sync' | 'bi_connect' | 'event_stream'`).

### Removed

- `data_products.consumptions` namespace — removed. Use `data_products.delivery`.
- `Consumption` model — removed. Use `DeliveryInterface`.

---

## [0.2.0] - Unreleased

### Breaking changes

- **`create_data_product()` now requires a `kind` argument.** Every data product
  must declare whether it is a `'source'` (atomic, domain-owned) or `'consumer'`
  (composed projection) data product. Calls without `kind` will raise a
  validation error.

  **Migration:** Add `kind` to every `create_data_product` call:

  ```python
  # Before
  client.data_products.create_data_product(name="Orders", domain="sales")

  # After
  client.data_products.create_data_product(name="Orders", domain="sales", kind="source")
  ```

- The `DataProduct` model now includes `kind: Literal['source', 'consumer']` as
  a required field. Code that constructs or validates `DataProduct` instances
  must account for the new field.

### New features

- **`get_usage_map()`** — Returns the source→consumer data product usage graph
  for the caller's organization as a tuple of `(nodes, edges)`. Each node
  includes `id`, `kind`, `name`, and `fanout`; each edge includes `source`,
  `target`, and `projection_spec_id`.

  ```python
  nodes, edges = client.data_products.get_usage_map()
  ```

- **Optional `kind` filter on `list_data_products()`** — Pass `kind="source"` or
  `kind="consumer"` to scope the list to one side of the data mesh. Omit to
  retrieve all data products (existing behaviour).

  ```python
  source_dps = client.data_products.list_data_products(kind="source")
  ```

### Changed

- `GET /dataproducts/:id` responses now include the `kind` field. This is
  additive and non-breaking for existing consumers — the field is simply present
  on every `DataProduct` object returned by `get_data_product()` and
  `list_data_products()`.

## [0.1.0] - Unreleased

### Added

- Initial SDK release
- `LoxtepClient` with JWT and SigV4 authentication
- Data products API (list, get, search, query, stream, replay)
- Flows API (list, get, create, get_writer)
- Connections API (list, get, create, test)
- Queues API (metadata, checkpoints, open_reader, open_writer)
- Quality API (list, get)
- Catalog and Discovery APIs
- Schemas, Projects, Domains, Standards, Data Contracts APIs
- Process Intelligence API (entity context, decision traces)
- Observe API (status, stream_config)
- Typed errors (`loxtep.errors`)
- Generated API types from Pydantic models
