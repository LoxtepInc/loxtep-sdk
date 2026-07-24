# Changelog

All notable changes to `@loxtep/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.22] - 2026-07-24

### Changed

- **`sdk-first-ingest.md`** — rewritten for the developer mental model (workspace
  → attach → create data product → `get_writer`); removed internal platform jargon.
- **Docs / READMEs** — removed `node_modules/@loxtep/sdk/docs/examples/*.mjs` run
  instructions and deleted the example scripts; write path is inline `get_writer` +
  `write()` in application code only.
- **CLI help** — `loxtep --help`, `ingest provision`, and `config init` no longer
  point readers at `node_modules/.../docs` or example scripts.

## [0.7.21] - 2026-07-23

### Fixed

- **HTTP errors** from the Loxtep API now surface the platform message
  (`{ success: false, error: { message, details } }`) instead of generic `HTTP 404`.
- **`instances.get_stream_config` / `loxtep attach`** call only the primary organizations
  endpoint (`GET /organizations/instances/{id}/stream-config`); client-side observe/metadata
  fallbacks removed.

## [0.7.20] - 2026-07-23

### Fixed

- **`loxtep attach`** no longer fails when `GET /organizations/instances/{id}/stream-config`
  returns **404** (endpoint not yet deployed): falls back to **`GET /observe/stream-config`**
  with `x-loxtep-instance-id`, then inline `metadata.rstreams` on the instance record.
- **`instances.get_stream_config`** uses the same resolution chain and returns `{ config, source }`.

### Deprecated in 0.7.21

- Client-side observe/metadata fallbacks introduced in 0.7.20 were removed; fix resolution on
  the organizations stream-config endpoint instead.

## [0.7.19] - 2026-07-23

### Fixed

- **`instances.get_stream_config`** (and **`loxtep attach`**) called
  `/instances/{id}/stream-config`, which resolves to a non-existent public route and
  returned **403 Forbidden**. Now uses
  `/organizations/instances/{id}/stream-config`, matching the platform API and
  `DataProductResolver` / `resolve_stream_sdk`.

## [0.7.18] - 2026-07-23

### Fixed

- **`loxtep attach`** now fetches `GET /instances/{id}/stream-config` and writes
  `region` + `streams` (LeoEvent, LeoStream, LeoCron, LeoS3, LeoKinesisStream,
  LeoFirehoseStream, LeoSettings) into `.loxtep/project.json` so `get_writer` /
  queue I/O work without manual LEO_* env or `~/.loxtep/config.json` bus setup.
- **`LoxtepClient.fromWorkspace()`** passes workspace `region` and `streams` into
  the client constructor.
- **`loxtep config list`** indicates when streams come from project.json vs global
  config.

## [0.7.17] - 2026-07-23

### Added

- **`workflows.save_workflow_bundle(project_id, { files, dry_run? })`** — HTTP
  wrapper for `POST /workflows/projects/{project_id}/workflow-bundle` (same
  bundle shape as agent `save_workflow_bundle`; requires platform workflows MS
  with the new endpoint deployed).
- **`buildSdkIngestBundle()`** — builds SDK-ingest topology (SDK connector
  connection node → source data product) for programmatic or CLI provisioning.
- **CLI `loxtep ingest provision`** — create SDK connector, save workflow
  bundle, and deploy to the attached instance (`--dry-run`, `--no-deploy`,
  `--name`, `--domain-id`).
- **CLI `loxtep bundle save`** — persist a workflow bundle JSON file
  (default `.loxtep/sdk-ingest-bundle.json`; supports `--dry-run`).
- **Docs** — [SDK-first ingest](./docs/sdk-first-ingest.md), example scripts
  (`generate-ingest-bundle.mjs`, `write-events.mjs`), and Getting Started updates
  for the MCP-free greenfield path.

## [0.7.16] - 2026-07-23

### Changed

- **CLI `list` stdout** is now a bare JSON **array** of summary rows (same as
  `instances list`), not `{ items, pagination }`. Pagination and cursor metadata
  remain in the raw API response, visible with `--debug` or `LOXTEP_DEBUG=1`.
  Affected: `projects`, `domains`, `data-products`, `workflows`, `triggers`,
  `standards`, `data-contracts`, `activity`, and `improvements`.

## [0.7.15] - 2026-07-23

### Changed

- **All CLI `list` commands** print pruned summary rows (IDs, names, status, and
  other fields needed to pick resources or configure workflows) instead of full
  API records. Affected: `domains`, `data-products`, `workflows`, `triggers`,
  `standards`, `data-contracts`, `improvements`, and `activity` (plus existing
  `instances list`). Use `--debug` or `LOXTEP_DEBUG=1` to dump the raw API payload to
  stderr. *(0.7.16: stdout is a bare array; pagination only in debug output.)*
- **`loxtep projects list | get <id>`** — discover project UUIDs in your org.
- **Getting Started** — documents what a project is, where `project_id` comes
  from (`init` / `config list`), and that `workflows list` uses the workspace
  project automatically (no `--project-id` required after `init`).

### Fixed

- **`loxtep config list`** and CLI client defaults now merge `.loxtep/project.json`
  (from `loxtep init` / `attach`) with `~/.loxtep/config.json`. Previously only
  the global config file was read, so `organization_id`, `project_id`, and
  `instance_id` showed as `(not set)` even after a successful init+attach.
  When attach sets a per-instance API gateway URL, `config list` also shows
  `workspace_api_url` separately from the platform `api_url`.
- **`loxtep init`** — requires authentication to register (or `--project-id` to
  bind) a platform project. No more silent `proj_local_*` ids that pass init but
  fail on `attach`/`generate`. Re-running `init` after login upgrades stale local
  ids. Lifecycle commands reject local-only `project_id` values with a clear fix.

## [0.7.14] - 2026-07-23

### Fixed

- **`instances.get()` / `loxtep attach --instance`** — production returns the
  instance as `{ success, data: Instance }`, not `{ data: { instance } }`. The
  SDK now normalizes both shapes (same pattern as `instances list` and
  `whoami`), fixing `TypeError: Cannot read properties of undefined (reading
  'instance_id')` on attach.

## [0.7.13] - 2026-07-23

### Changed

- **`loxtep instances list`** prints a pruned summary (`instance_id`, `name`,
  `api_url`, `region`, `status`, `instance_type`) instead of full API records
  (no `stack_id`, `connection_details`, or internal metadata). Use
  `LOXTEP_DEBUG=1 loxtep instances list --debug` for the raw API payload.

### Fixed

- **CLI HTTP auth** — `whoami` and `instances list` no longer use hardcoded dummy
  SigV4 (`cli`/`cli`). They share `createCliHttpClient`, which loads STS credentials
  from `credentials.json`, proactively refreshes when missing/expired, and warns when
  only dummy creds remain (empty HTTP 200 bodies).
- **`whoami`** — debug prints the resolved request URL; detects empty/non-JSON
  `{ "message": "OK" }` bodies; fetches organization name when JWT only has
  `organization_id`.

## [0.7.12] - 2026-07-23

### Fixed

- **`loxtep instances list`** no longer silently returns `[]` when the API uses
  alternate list shapes (`data` as an array, `data.instances`, double-wrapped
  envelopes). Empty output now exits non-zero with guidance.
- **CLI API host resolution** prefers `api_base_url` saved at browser login over
  the baked-in production default when you have not set `api_url` in config —
  fixes dev/prod mismatches that returned empty lists and blank `whoami`.

## [0.7.11] - 2026-07-23

### Fixed

- **`loxtep whoami`** parses double-wrapped `{ success, data }` envelopes, camelCase
  `/users/me` payloads, and falls back to JWT claims when the API body is sparse.
- **Browser login** persists `api_base_url` from the app OAuth callback (matches the
  API host you actually authenticated against).
- **`whoami`** exits non-zero and prints guidance when identity fields are still
  placeholders; use `LOXTEP_DEBUG=1 loxtep whoami` or `loxtep whoami --debug` to
  inspect the raw API response.

## [0.7.10] - 2026-07-23

### Fixed

- **`loxtep whoami`** parses the production `{ success, data: { user, organization } }`
  envelope instead of expecting flat top-level fields (which showed `—` for email/org).

### Added

- **CLI integration test suite** — mock platform API, read-only and mutating command
  tests, local lifecycle (`init` → `attach` → `generate` → `deploy`), and opt-in
  staging smoke (`LOXTEP_CLI_SMOKE=1`).
- **`parseCurrentUserResponse`** shared helper for session/whoami envelope parsing.
- **`fetch_fn`** on CLI client creation; **`cliOptions`** injection on
  `generate`, `deploy`, and `test` commands for integration tests.

### Changed

- **README and docs** rewritten for greenfield onboarding:
  `login` → `init` → `attach` → `generate` before stream I/O or manual client config.
- **`tsconfig.json`** excludes `**/__tests__/**` from the publish build.

## [0.7.9] - 2026-07-23

### Fixed

- **Browser login** no longer hangs after printing success: the localhost callback
  server now destroys keep-alive connections and closes immediately so the CLI
  process exits as soon as tokens are saved.

## [0.7.8] - 2026-07-23

### Changed

- **README and quick reference** use customer-facing API area names instead of
  internal MCP facade terminology (`loxtep_session`, "MCP-aligned facades", etc.).
  SDK paths (`client.build`, …) are unchanged.

## [0.7.7] - 2026-07-23

### Changed

- **CLI help** no longer exposes internal MCP facade names (`loxtep_session`,
  `client.build`, etc.). Commands are grouped under customer-facing headings
  (Authentication, Workspace, Build & deploy, Governance, …).

## [0.7.6] - 2026-07-23

### Added

- **`loxtep --version`** (also `-V` and `loxtep version`) prints the installed
  `@loxtep/sdk` semver, e.g. `@loxtep/sdk 0.7.6`.

## [0.7.5] - 2026-07-23

### Changed

- **CLI help** (`loxtep --help`) reorganized under **MCP-aligned SDK facades**
  (Session, Workspace, Build, Define, Review, Query, Observe, Context) instead
  of a flat command list. Help text lives in `src/cli/help.ts`.

## [0.7.4] - 2026-07-23

### Changed

- **Documentation** defaults to **pnpm** (`pnpm add`, `pnpm exec loxtep`) instead of
  npm/npx across README, getting started, quick reference, and SDK pairing.
- **New guide:** [`docs/code-first-cli.md`](./docs/code-first-cli.md) documents the
  `loxtep init → attach → generate → test → deploy` workflow, when init is
  required vs login-only programmatic use, and cross-links from getting started
  and quick reference.
- CLI auth hints now reference `pnpm exec loxtep login` for consistency with docs.

## [0.7.3] - 2026-07-23

### Fixed

- **`loxtep login`** now saves credentials to **`./.loxtep/credentials.json`** in
  the current working directory by default (not `~/.loxtep/credentials.json`).
  Use `--global` for the home-directory path. Read resolution walks upward for
  a local `credentials.json` before falling back to global.

## [0.7.2] - 2026-07-23

### Changed

- **Documentation** aligned with **v0.7.0+ MCP facade API**: README, getting
  started, quick reference, event replay cookbook, and AGENTS guidance now use
  `client.get_writer` / `client.get_reader` and facade paths
  (`client.build.*`, `client.observe.*`, etc.) instead of removed flat
  namespaces (`client.data_products`, `client.workflows`, …).
- **Module export docs** corrected: import from `@loxtep/sdk` (and
  `@loxtep/sdk/errors` only for the errors subpath).

## [0.7.1] - 2026-07-23

### Security

- **js-yaml** upgraded to **4.3.0+** ([GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) /
  CVE-2026-59869): fixes quadratic CPU use from chained YAML merge-key (`<<:`) documents.

### Changed

- **leo-sdk** bumped **7.1.12 → 7.1.21** (latest npm; lodash already at 4.18.x upstream).
- **Dependency overrides** (transitive hardening for npm consumers):
  - `uuid` → **^11.1.0** (leo-sdk still declares 8.x)
  - `fast-csv` → **^5.0.7** (drops deprecated `lodash.isequal`; leo-sdk still declares 4.x)
  - `lodash` → **^4.18.0** (unchanged)

## [0.7.0] - 2026-07-23

### Breaking changes — MCP-aligned client facades

`LoxtepClient` now exposes **10 namespaces** that mirror the hosted MCP tool
facades (`loxtep_session`, `loxtep_connect`, `loxtep_workspace`, etc.). The
previous flat top-level namespaces (`projects`, `workflows`, `connectors`,
`improvements`, …) are removed from the public client surface.

| MCP facade | SDK namespace | Former top-level namespaces (removed) |
| --- | --- | --- |
| `loxtep_session` | `client.session` | — |
| `loxtep_connect` | `client.connect` | `connectors`, `templates` |
| `loxtep_workspace` | `client.workspace` | `projects`, `instances`, `versions` |
| `loxtep_build` | `client.build` | `workflows`, `triggers`, `data_products`, `targets` |
| `loxtep_define` | `client.define` | `schemas`, `quality`, `standards`, `data_contracts`, `domains` |
| `loxtep_meaning` | `client.meaning` | `thesaurus` |
| `loxtep_review` | `client.review` | `approvals`, `improvements` |
| `loxtep_query` | `client.query` | `catalog`, `discovery` |
| `loxtep_observe` | `client.observe` | `observe`, `queues` (partial) |
| `loxtep_context` | `client.context` | `procedures`, `activity`, `process_intelligence` |

CLI commands and internal tooling were updated to use the new facade paths
(e.g. `client.workspace.projects.get`, `client.review.improvements.list`,
`client.connect.connectors.get`).

### Added

- Facade modules: `session`, `connect`, `workspace`, `build`, `define`,
  `meaning`, `review`, `query`, `observe` (facade), `context`.

### Changed

- SDK docs and MCP mapping updated for the 10-tool MCP surface.

## [0.6.0] - 2026-07-14

### Added

- **`client.approvals`** — programmatic parity with the web inbox and
  Slack/email channels for pipeline HITL gates. `list(filters)`,
  `list_pending(organization_id?)`, `resolve(id, action, organization_id?)`,
  `approve(id, organization_id?)`, `reject(id, organization_id?)`. Backed by
  the agent-orchestration `approval-requests` REST API; resolving an approval
  via the SDK resolves the same shared record as the inbox, Slack, and email
  buttons. Mirrors the `loxtep_review` MCP tool
  (`list_pending_approvals` / `resolve_approval`).

## [0.5.0] - 2026-07-13

### Breaking changes — API surface redesign

The client surface was reorganized around the ingest → define → deliver journey
and made consistent. All renames are clean breaks (no deprecated aliases).

- **Casing** — every method is now `snake_case`. Renamed:
  `workflows.listWorkflows → list`, `workflows.getWorkflowGraph → get_graph`,
  `workflows.createWorkflow → create`,
  `discovery.getEvidence → get_evidence`,
  `discovery.getLineageImpact → get_lineage_impact`,
  `discovery.getGovernanceFlags → get_governance_flags`,
  `discovery.runDiscovery → run`,
  `connectors.getOauthUrl → get_oauth_url`,
  `projects.applyTemplate → apply_template`,
  `thesaurus.listTerms → list_terms`,
  `thesaurus.resolveCanonicalKey → resolve_canonical_key`,
  `data_products.getUsageMap → get_usage_map`.
- **`flows` merged into `workflows`** — `client.flows` is removed. Use
  `client.workflows` (`list`, `get`, `create`, `get_graph`, `deploy`). The
  low-level `get_writer` escape hatch remains on `workflows` but is `@internal`
  and undocumented; use `data_products.get_writer(name)`.
- **`connections` → `triggers`** — ingest source bindings. Types
  `Connection*` → `Trigger*`; `CONNECTION_TYPES`/`CONNECTION_STATUSES` →
  `TRIGGER_TYPES`/`TRIGGER_STATUSES`.
- **`delivery` → `targets`** — delivery sink bindings. Types
  `DeliveryInterface`/`DeliveryType`/`Delivery*Input` → `Target`/`TargetType`/
  `Target*Input`; the `deliveryType` discriminator → `targetType`.
- **`improvements`, `activity`, `process_intelligence`** marked `@internal`
  (still on the client, excluded from docs and the generated API reference).

### CLI

- `flows *` commands removed; use `workflows list | get | create | deploy`.
- `connections *` commands renamed to `triggers *`.

## [0.4.0] - 2026-07-13

### Breaking changes

- **`consumptions` namespace removed** — use `data_products.delivery` and `DeliveryInterface` instead.

### Added

- **`data_products.delivery` namespace** — `list`, `create`, `update`, and `delete` for delivery interfaces.
- **`data_products.readiness` / `data_products.promote`** — medallion tier promotion APIs.
- **`instances` client namespace** and **`loxtep instances` CLI** — list, get, create, and update runtime instances.
- **Data product promotion CLI** — `loxtep data-products readiness` and `loxtep data-products promote`.
- **Data contracts CLI** — `loxtep data-contracts create`.

### Changed

- Flow and data-product writers now delegate buffering/batching to the rstreams `load` stream via `createQueueWriter`.

---

## [0.3.0] - 2026-06-08

### Terminology Migration

The SDK now uses "delivery" terminology as the primary interface, replacing the
overloaded "consumption" vocabulary. This aligns the SDK with the platform UI,
documentation, and MCP tool names.

**Namespace rename:** `consumptions` → `delivery`

```ts
const interfaces = await client.dataProducts.delivery.list(dpId);
```

**Type:** `DeliveryInterface`

```ts
import type { DeliveryInterface } from '@loxtep/sdk';
```

**`deliveryType` field on `DeliveryInterface`:**

```ts
const webhook: DeliveryInterface = {
  id: 'di_...',
  deliveryType: 'webhook',
  endpointUrl: 'https://example.com/hook',
  method: 'POST',
  // ...
};
```

The old `consumptions` namespace and `Consumption` type have been removed.

### New features

- **`dataProducts.delivery` namespace** — Primary namespace for managing delivery
  interfaces with `list()`, `create()`, `update()`, and `delete()` methods.
- **`DeliveryInterface` type** — Includes a `deliveryType` discriminator field
  (`'webhook' | 'api_endpoint' | 'export' | 'database_sync' | 'bi_connect' | 'event_stream'`).

### Removed

- `dataProducts.consumptions` namespace — removed. Use `dataProducts.delivery`.
- `Consumption` type — removed. Use `DeliveryInterface`.

---

## [0.2.0] - Unreleased

### Breaking changes

- **`createDataProduct()` now requires a `kind` argument.** Every data product
  must declare whether it is a `'source'` (atomic, domain-owned) or `'consumer'`
  (composed projection) data product. Calls without `kind` will throw a
  validation error.

  **Migration:** Add `kind` to every `createDataProduct` call:

  ```ts
  // Before
  await client.dataProducts.createDataProduct({ name: 'Orders', domain: 'sales' });

  // After
  await client.dataProducts.createDataProduct({ name: 'Orders', domain: 'sales', kind: 'source' });
  ```

- The `DataProduct` interface now includes `kind: 'source' | 'consumer'` as a
  required field. TypeScript consumers that destructure or extend `DataProduct`
  may need to account for the new field.

### New features

- **`getUsageMap()`** — Returns the source→consumer data product usage graph for
  the caller's organization as `{ nodes: UsageMapNode[], edges: UsageMapEdge[] }`.
  Each node includes `id`, `kind`, `name`, and `fanout`; each edge includes
  `source`, `target`, and `projection_spec_id`.

  ```ts
  const { nodes, edges } = await client.dataProducts.getUsageMap();
  ```

- **Optional `kind` filter on `listDataProducts()`** — Pass `kind: 'source'` or
  `kind: 'consumer'` to scope the list to one side of the data mesh. Omit to
  retrieve all data products (existing behaviour).

  ```ts
  const sourceDPs = await client.dataProducts.listDataProducts({ kind: 'source' });
  ```

### Changed

- `GET /dataproducts/:id` responses now include the `kind` field. This is
  additive and non-breaking for existing consumers — the field is simply present
  on every `DataProduct` object returned by `getDataProduct()` and
  `listDataProducts()`.

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
- FlowWriter with transparent batching
- QueueReader with async iteration
- Stream helpers (`mapStream`, `filterStream`)
- CLI (`loxtep`) with login, config, data-products, flows, connections, queues
  commands
- Typed errors (`@loxtep/sdk/errors`)
- Generated API types from Zod schemas
