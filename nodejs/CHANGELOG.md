# Changelog

All notable changes to `@loxtep/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`loxtep instances stream-config [<instance_id>]`** — prints bus resource
  names (`LeoCron`, `LeoS3`, …) via JWT
  `GET /organizations/instances/{id}/stream-config`. Defaults to the attached
  workspace instance / `LOXTEP_INSTANCE_ID`. Hosted MCP does not expose this.

## [0.9.11] - 2026-08-12

### Fixed

- **`createRStreamsSdk` / stream I/O** — restore top-level
  `createRequire(import.meta.url)` in `leo-runtime.ts`. The 0.9.7
  `new Function('return import.meta.url')` workaround always throws
  `SyntaxError: Cannot use 'import.meta' outside a module` (Function bodies
  are Scripts, never Modules), breaking `get_writer()` / `get_reader()` for
  every consumer from 0.9.7–0.9.10. Jest maps the module to a CJS-safe stub
  (and excludes it from coverage) instead of breaking the real runtime.

## [0.9.10] - 2026-08-12

### Fixed

- **CLI API host from credentials** — `resolveCliApiUrl` prefers credentials
  `api_base_url` over a stale `~/.loxtep/config.json` `api_url`. Stops sending
  a host-bound login token (e.g. apidev `CLISESS#`) to production and getting
  `users:read` RBAC denials on `loxtep whoami`. `LOXTEP_API_URL` still wins.
  `whoami` prints a hint when the error looks like that mismatch.

## [0.9.9] - 2026-08-11

### Changed

- **Session channels stay isolated** — library `login()` defaults to
  `client_channel: 'sdk_node'` (`SDKSESSNODE#`). CLI console/browser login
  explicitly uses `cli` (`CLISESS#`). Library `browserLogin()` defaults to
  `/auth/sdk?runtime=node`; CLI passes `channel: 'cli'` → `/auth/cli`.

## [0.9.8] - 2026-08-11

### Changed

- **CLI browser login** opens `/auth/cli` instead of `/auth/mcp`. The app mints a
  dedicated CLI session (`CLISESS#`) via `/app/auth/delegate-session`, so web SPA
  token refresh no longer revokes CLI credentials. Re-run `loxtep login` once
  after the platform deploy that ships this change.

## [0.9.7] - 2026-08-10

### Added

- **Phase A SDK/CLI surface parity** — typed REST under the existing 10 MCP
  facades (no new hosted tools):
  - **`client.meaning.ontology`** — ontology concepts CRUD + relationships
    (`list/get/create/update/delete_concept`, `create/get_relationships`).
  - **`client.meaning.packs`** + CLI `loxtep packs list|activate|status` —
    vocabulary pack recommend / enable / activation-state.
  - **`client.meaning.semantic`** — `search_semantic_layer`,
    `get_semantic_artifact`, `get_semantic_completeness`.
  - **`client.review.cdlc`** + CLI `loxtep cdlc transition|review-queue` —
    lifecycle get/transition, propagate, lineage, deps, steward review queue.
  - **`client.review.mining`** + CLI `loxtep candidates list|act` —
    `run_mining_pass`, `list_candidates`, `act_on_candidate`.
  - **`client.context.procedures`** — graph procedures CRUD +
    `import_process_graph` / `export_process_graph` (list path now targets
    authored graph procedures, not PI discovery).
  - **`client.context.process_intelligence.decisionTraces`** — causal chain,
    similar decisions, and create-with-links (LOX-1226 / LOX-1248).
  - **`client.context.issues` / `.goals` / `.workstreams`** — thin agent-
    orchestration **reads** (`list`/`get`); writes remain MCP-only.
- **Docs** — `docs/sdk-mcp-mapping.md` + `AGENTS.md` updated for the Phase A
  surface (ontology/packs/semantic, CDLC/mining/candidates, procedures,
  decisionTraces, agent-workspace reads).

### Changed

- **`client.context.procedures.list`** — now targets authored graph procedures
  (`GET /graph/organizations/{org}/procedures`) instead of the
  process-intelligence discovery list. Filters match MCP (`status`, `name`,
  `domain_id`, …); pagination args from the old PI wrapper are removed.

## [0.9.6] - 2026-08-10

### Fixed

- **CLI `DEP0187` warning** — stop eagerly importing `leo-sdk` on every command.
  REST-only commands (e.g. `loxtep data-products list`) no longer load the stream
  runtime, avoiding Node's `fs.existsSync` deprecation from leo-sdk's
  `leoConfigure` side effect. `leo-sdk` is still required lazily when constructing
  a stream reader/writer.

## [0.9.5] - 2026-08-10

### Fixed

- **CLI auth / expired session** — when JWT or AWS SigV4 STS credentials are expired
  and `/auth/refresh` fails (e.g. session revoked), fail fast with
  `AuthenticationError` and `Run: loxtep login` instead of signing with dead STS
  and dumping `AuthorizationError: The security token included in the request is
  expired`. Also map API Gateway ExpiredToken `403` to authentication (not RBAC),
  retry refresh once on that status, and print a one-line CLI error instead of a
  stack dump.

## [0.9.4] - 2026-08-07

### Fixed

- **Error sanitization** — strip Knex/Postgres SQL statements and column lists from
  platform error messages (e.g. catalog index failures on `loxtep push`). Known
  unique constraints rewrite to plain language ("a data product with this name
  already exists in the project") instead of dumping `insert into "data_products" (…)`.

## [0.9.3] - 2026-08-07

### Fixed

- **`loxtep push` / `parseHttpError`** — surface nested `details.error` when the API
  returns opaque wrappers like `Workflow bundle catalog index failed` (so the
  underlying catalog failure is visible in the push summary).
- **`loxtep lint`** — fail on duplicate workflow or data-product `name` values across
  the local project (matches Postgres `UNIQUE(project_id, name)`), including when
  `--workflow` scopes schema checks to one package.

## [0.9.2] - 2026-08-07

### Fixed

- **`loxtep triggers get` / `targets get`** — when `--workflow-id` is omitted, resolve
  it from the project entities list before calling the workflow-scoped entity API
  (backend requires `workflow_id`). Same for update/delete/test.
- **`triggers list` summary** — include `workflow_id` so list → get is usable
  without psychic powers.

## [0.9.1] - 2026-08-07

### Added

- **`client.observe.list_deployments` / `get_deployment`** — REST parity with MCP
  `loxtep_observe` deployment status ops (`GET /workflows/deployments` and
  `GET /workflows/deployments/{id}`). Also available via
  `client.workspace.deployments`.
- **`loxtep deployments list | get <id>`** — CLI poll surface after `loxtep deploy`
  (replaces the old "CLI status poll TBD" toast).
- **`loxtep approvals list | approve <id> | reject <id>`** — CLI parity with
  `client.review.approvals` / MCP `loxtep_review` HITL inbox.

## [0.9.0] - 2026-08-07

### Added

- **`loxtep projects clone` (LOX-1188)** — Cloud→Local project materialization
  (GitHub clone when linked, or workspace export for unbound projects), plus
  `projects pull` / `projects push` GitHub sync wrappers.
- **`loxtep link` / `projects link` (LOX-1186)** — bind a cloud project to a local
  directory and track known locals in `~/.loxtep/workspaces.json`.
- **Unpublished inventory (LOX-1187)** — `loxtep status --unpublished` and
  `loxtep projects changes` list Local→Cloud / Cloud→Deployed file+entity
  deltas (workflows, connections, data products, schema package) using the same
  discovery as `loxtep push`. Compares against `.loxtep/push-manifest.json`
  (written on successful push); escalates with cloud workflow ids when linked.
  `loxtep deploy` **warns** (does not block) when Local→Cloud is dirty.
- **`loxtep status`** — cwd-first project workspace status
  (local attach + API host, GitHub linked|unbound, never-deployed / deployed /
  stale, Local→Cloud and Cloud→Deployed dirty summaries, next-action hint).
  Distinct from `loxtep observe status`. `--json` emits the full
  `ProjectWorkspaceStatus` payload.
- **Enriched `loxtep projects list|get`** — cheap flags for github / local path
  (when cwd matches) / deployed when detectable via deployments list.
- **Deployments list client** — `client.workspace.deployments.list` →
  `GET /workflows/deployments`.
- **Project workspace status schema (LOX-1184)** — Zod + TypeScript types for
  three-layer local / cloud / deployed status, unpublished deltas, list
  enrichment, and population cost ceilings. Docs:
  `docs/project-workspace-status.md`. Consumers: CLI `status` /
  enriched `projects list|get`, MCP `get_project_workspace_status`
  (planned).

### Fixed

- **`loxtep deploy` tracking** — surfaces a real deployment / tracking id from
  the deploy response instead of printing `undefined` for `run_id`.

## [0.8.0] - 2026-08-03

### Added

- **`loxtep connectors test <connector_id>`** — connectivity probe
  (`POST /connectors/{id}/test`), distinct from sample capture and from
  `loxtep test <module>` (workflow modules).
- **`loxtep connectors capture-samples <connector_id> --entity-type <name> [--limit N]`** —
  bounded entity sample fetch (`POST /connectors/{id}/capture-samples`, limit 1–25).
- Matching SDK client methods on `client.connect.connectors` for `test` and
  `capture_samples`.

### Fixed

- Jest CI no longer fails with a green suite when CLI tests leave a sticky
  `process.exitCode = 1` on worker processes (`jest.setup.cjs` clears it after
  each test).
- CLI help no longer mentions internal MCP operation names (customer-facing
  surface only).

## [0.7.30] - 2026-07-28

### Added

- **`LOXTEP_CONFIG_DIR`** — `getConfigDir()` honors this env override (parity with
  Python), so tests and CI can isolate `~/.loxtep` without mocking `homedir`.
- **`requireAutoConfig()`** — shared ValidationError paths for missing
  `project.json` / `credentials.json` (used by `fromWorkspace`).

### Changed

- **`fromWorkspace` tests** use `shared/fixtures/workspace/` + `LOXTEP_CONFIG_DIR`
  instead of conditional skips when the developer machine has real credentials.

## [0.7.29] - 2026-07-25

### Fixed

- **Update-available notice** is now styled (bold yellow, `⚠` marker) instead of
  plain text, so it's harder to miss among other CLI output.
- **Update-available notice now prints on every command**, not just ones that
  succeed. `requireCliClient()`'s `process.exit(1)` (hit on any command run
  without valid login) used to hard-kill the process before `main()`'s
  `finally` block could await the pending update check, silently dropping the
  notice. Added `startUpdateCheck()`/`waitForUpdateCheck()` so early-exit
  paths can wait for it too.

## [0.7.28] - 2026-07-25

### Fixed

- **`loxtep deploy`** now recognizes and activates local `workflows/<id>/workflow.json`
  packages (the `ingest`/`transform`/`delivery create` output), not just flat
  `.ts`/`.js` modules. Previously it printed `No workflow modules found in
  workflows/. Nothing to deploy.` for SDK-first projects even after a
  successful `provision`/`lint`/`push`, silently no-op'ing the documented
  golden path (`provision → lint → deploy`). It now pushes
  (`save_workflow_bundle`) + reindexes + activates (`workflows.deploy`) any
  local JSON-entity packages when no `.ts`/`.js` modules are found — the same
  sequence `loxtep ingest create --deploy` already used successfully.

## [0.7.27] - 2026-07-24

### Fixed

- **Workspace context loads** paginate at the platform max page size (100)
  instead of requesting `1000` in a single call, which exceeded the platform
  ceiling and silently dropped results past the cap. Affects `loxtep generate`
  and any client that resolves the full workspace context.
- **`buildPlatformRequestUrl`** scopes the `/dataproducts` URL-doubling fix to
  the `/dataproducts` resource itself, instead of rewriting every sibling path
  that shares the prefix (e.g. `/dataproducts/<id>/tables`).
- **Ajv loader** resolves the vendored schema validator relative to the
  `validate-entity` module, not the process entry point, so `validateEntity()`
  works under `pnpm`'s symlinked node layout.

## [0.7.26] - 2026-07-24

### Added

- **CLI update notifier:** after each command, if a newer `@loxtep/sdk` is on npm,
  print an upgrade hint to stderr (cached 24h under `~/.loxtep/update-check.json`).
  Opt out: `LOXTEP_NO_UPDATE_NOTIFIER=1` / `NO_UPDATE_NOTIFIER=1`, or any truthy `CI`.
- **CLI stage creates:** `loxtep ingest create` (alias `provision`), `transform create`,
  `delivery create` (`workflow_type: delivery`), `loxtep push` (bundle + reindex).
- **`--iceberg`** on ingest create → `storage.iceberg_enabled` on the source DP.
- **`projects.reindex`** client method for post-push index refresh.
- **Targets / triggers API** uses project entities
  (`/workflows/projects/{project_id}/entities/.../connections`), not the removed
  consumptions or `/workflows/connections` routes.

### Changed

- Hard cutover terminology: delivery workflows use `workflow_type: delivery`;
  ingest = trigger connection, delivery = target connection.

## [0.7.25] - 2026-07-24

### Fixed

- **`buildPlatformRequestUrl`** preserves query strings (`?page_size=…`, filters).
  Default URL resolution previously stripped them, silently defeating pagination
  and filtered list/search calls.
- **`login --console`** persists `api_base_url` into `credentials.json` (same as
  browser OAuth), so later commands do not fall back to prod when `LOXTEP_API_URL`
  is unset.
- **`credentials.json`** is written/chmod'd to mode `0600`.
- **HTTP 400 parsing** also reads `field_errors` nested under the platform
  `error` envelope.

## [0.7.24] - 2026-07-24

### Added

- **Vendored entity JSON schemas** under `schemas/entity-json-schemas/` with Ajv
  `validateEntity()` for offline validation. Sync from platform with
  `pnpm run sync:entity-schemas -- /path/to/loxtep`.
- **`loxtep connectors list [--type sdk]`** — API-backed connector listing.
- **`loxtep lint [--workflow <id>]`** — offline schema + relationship lint of the
  local entity package.
- **`loxtep deploy --dry-run`** — lint-only preflight (same engine as `loxtep lint`).

### Changed

- **`loxtep ingest provision`** is local-first: reuse/create an SDK connector via
  API, write `connectors/` + `workflows/<id>/` JSON, validate, then stop. No
  `save_workflow_bundle` / deploy by default. Pass `--deploy` to publish; use
  `--connector-id` to force reuse; `--dry-run` validates without writing files.

## [0.7.23] - 2026-07-24

### Fixed

- **`loxtep ingest provision`** now sends `metadata.instance_id` (and `project_id` /
  `region` when known) when creating the SDK connector. Multi-instance orgs were
  getting a opaque `ValidationError: Validation Error` because the platform
  requires an explicit instance for SDK connectors.
- **HTTP 400 parsing** prefers a string `error.details` over a generic title like
  `"Validation Error"`, so CLI failures show the real platform reason.

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
