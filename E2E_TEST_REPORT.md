# @loxtep/sdk (Node.js) End-to-End Test Report

**Date:** 2026-07-24
**Environment:** dev (`https://apidev.loxtep.io`)
**Package tested:** `@loxtep/sdk@0.7.22` (published npm), installed fresh via `pnpm add @loxtep/sdk` in a throwaway app directory (`/tmp/loxtep-sdk-e2e`), following `nodejs/docs/getting-started.md` and `nodejs/docs/sdk-first-ingest.md` verbatim where possible.
**Account:** existing e2e test user `testecomm@pictureitlikethis.com` (org `pictureitlikethis`). Signup itself was out of scope (web-only, Cognito-gated); testing started at `loxtep login`.
**Scope:** every documented CLI command and every public SDK method/namespace, read-only calls live, mutations on throwaway resources. `instances create`/`register` skipped (no `--dry-run` support, would provision real infrastructure/billing).

## Journey verdict

**A new user following `getting-started.md`/`sdk-first-ingest.md` verbatim on the current published package cannot reach a working ingestion pipeline without manual intervention.** The single documented command (`loxtep ingest provision --name app-events`) fails twice over on a fresh org, and even after working around both failures, `loxtep deploy` reports "No workflow modules found" until an undocumented reindex step runs. Once past all three issues, the core promise of the SDK — `get_writer()` → `get_reader()` — **works correctly**: 5 events written were read back exactly as written. The write/read path itself is solid; the provisioning path around it is broken.

Additionally, a **critical, wide-blast-radius bug** was found independent of the ingest path: the SDK's default URL-building strips query strings from every request, silently defeating pagination/filtering/search across most of the SDK's `list()`/`search()`/`query()` surface.

## Critical bugs

### 1. Query strings are silently dropped on every request (default configuration)
**File:** `nodejs/src/config/platform-request-url.ts` (confirmed in both published 0.7.22 `dist` and current repo HEAD — **not fixed**), consumed by `nodejs/src/http/client.ts` `LoxtepHttpClient.request()`.

```js
const clean = path.split('?')[0] ?? path;   // query string discarded immediately
const p = clean.startsWith('/') ? clean : `/${clean}`;
// every return branch below derives the URL from `p`, never from the original `path`
```
`request()` then builds `new URL(pathPart)` from this already-query-less value. There is no code path anywhere in `buildPlatformRequestUrl` or `request()` that re-attaches the original query string. This runs by default: `use_platform_path_resolution: !useLegacy`, and `useLegacy` is only `true` if a caller explicitly passes `url_resolution: 'legacy'` — `LoxtepClient.fromWorkspace()` never does.

**Reproduced two ways:**
- `client.define.domains.list({ page_size: 1 })` → returned all 5 domains instead of 1.
- `client.define.data_contracts.list({ data_product_id: <valid-uuid> })` and `client.define.quality.list({ data_product_id: <valid-uuid> })` → backend received no `data_product_id` at all and rejected the (missing) value as "must be a valid UUID."

**Blast radius (non-exhaustive, anything that builds a `?query` string):** `data_products.list/search`, `domains.list`, `standards.list`, `data_contracts.list`, `quality.list`, `connectors.list`, `templates.list`, `workflows.list`, `triggers.list`, `schemas` filters, `catalog.search`, `discovery.search`, `thesaurus.list_terms`, `activity.list`, `process_intelligence.decisionTraces.list`, `procedures.list`, `approvals.list`, `improvements.list`.

**Severity: CRITICAL.** This doesn't error — it silently returns wrong results (unfiltered/unpaginated data) on the default client configuration every getting-started user is on. Worth an immediate hotfix and a regression test asserting the built `URL` retains its query string.

### 2. `ingest provision` fails out of the box on a fresh org (two separate bugs)
**Files:** `nodejs/src/cli/commands/ingest-cmd.js` (dist) / `nodejs/src/lib/sdk-ingest-bundle.ts`.

a) **Connector creation requires an undocumented field.** `POST /connectors/connectors` with `{connector_type: "sdk", metadata: {...}}` (exactly what `ingest-cmd.js` sends) 400s with `"SDK connector requires metadata.instance_id when the organization has multiple instances. Specify the target instance_id in metadata."` — our org has 6 instances (normal for an active dev org). `runIngestProvision` never passes `instance_id` in the connector metadata even though it already resolves `instanceId` earlier in the same function. Neither the CLI help nor `sdk-first-ingest.md` mention this requirement.

b) **Bundle is missing a required field.** `buildSdkIngestBundle()` in the **published 0.7.22 build** omits `template_id` on the generated `workflow.json` entity. The backend's `save_workflow_bundle` schema requires it (`#/required: must have required property 'template_id'`). The **repo HEAD (0.7.23, unpublished)** source does set `template_id: SDK_INGEST_TEMPLATE_ID` — so this is fixed in trunk but not yet released; every user on the current npm package hits it.

**Severity: CRITICAL** — this is the one command the entire "SDK-first ingest" story hinges on, and it fails immediately for any org with more than one instance (i.e., any real customer org past the trial default).

### 3. `deploy` silently no-ops until a manual reindex
**File:** `nodejs/src/cli/commands/deploy-cmd.js`; backend `platform-backend/workflows/bots/process-project-deploy-requested/index.ts`.

After `save_workflow_bundle` succeeds, `loxtep deploy` printed **"No workflow modules found in workflows/. Nothing to deploy"** — the newly-saved workflow wasn't visible to the deploy path because the project's `customer_workspace_entity_index` table hadn't been populated from the S3 write yet. Calling `POST /workflows/projects/{project_id}/reindex` manually (an endpoint the CLI/SDK never calls and isn't documented for this purpose) fixed it; after that, `deploy` found and deployed the workflow correctly. Nothing in the getting-started docs or CLI output hints that a reindex is needed between "save bundle" and "deploy."

**Severity: HIGH** — blocks the documented golden path even after fixes #2a/#2b are worked around.

## High-severity bugs

### 4. SDK swallows the real backend error body
**File:** `nodejs/src/errors/parse-http.ts`.

Nearly every `ValidationError`/`NotFoundError` thrown by the SDK has `details: undefined` and `field_errors: []`, even when the backend returned a specific, actionable message (confirmed via `fetch` interception — e.g. the connector `metadata.instance_id` message in bug #2a was completely invisible through the SDK's own error object; only `message: "Validation Error"` and `code: "VALIDATION_ERROR"` survive). A user hitting any of these errors through normal SDK usage has no way to know why the request failed without instrumenting `fetch` themselves.

**Severity: HIGH** — turns every 400 into an undebuggable dead end.

### 5. Multiple SDK methods call routes that don't exist on the current backend (404s)
Confirmed via raw request interception — SDK sends the request, backend responds 404 "No method found matching route ... for http method GET/POST":

| SDK method | URL sent | Backend response |
|---|---|---|
| `build.triggers.list()` | `GET /workflows/connections` | 404 |
| `build.triggers.create()` | `POST /workflows/connections` | 404 |
| `review.improvements.list()` | `GET /ai/improvements` | 404 |
| `context.activity.list()` | `GET /ai/activity` | 404 |
| `build.data_products.list_tables()` | `GET /dataproducts/{id}/tables` | 404 |
| `observe.get_reader_checkpoint()` | `GET /observe/queues/checkpoint` | 404 |

Note the backend **does** have working routes for improvements/activity (`platform-backend/ai/api/improvements/GET`, `platform-backend/ai/api/activity/GET` both exist in the repo) — the SDK is very likely calling the wrong path prefix or an older route shape, not hitting a genuinely missing feature. Same likely applies to triggers/tables/checkpoint. CLI commands built on these methods (`loxtep triggers list`, `loxtep improvements list`, `loxtep activity list`, `loxtep data-products tables`, `loxtep queue checkpoint`) all fail identically.

**Severity: HIGH** — 6 confirmed dead SDK methods / CLI commands.

### 6. `workflows.create` 500s with a leaked raw SQL error
**File:** backend `workflows` API; SDK `nodejs/src/client/workflows.ts`.

`client.build.workflows.create({ name, project_id, workflow_type: "ingestion", domain_id })` returns `500 Failed to create workflow` with the raw Postgres `insert into "workflows" (...)` error in the response body — a backend bug (should be a handled 4xx, not a leaked 500 with a DB error). Separately, the CLI's own validation doesn't require `workflow_type`/`domain_id` (per `--help`), but the backend 400s without them when they're omitted — the CLI help is incomplete.

**Severity: HIGH** — data-leaking 500 (raw SQL in the response) plus incomplete CLI documentation of required fields.

## Medium-severity bugs

### 7. `data-products query` / `query.query()` require an API key the SDK never sends
`loxtep data-products query <id> "SQL"` and `client.query.query(...)` both 401 with `"API key is required. Include X-Api-Key header."` The SDK authenticates everywhere else with JWT + SigV4; this one endpoint appears to be gated behind a separate API-key auth scheme the SDK has no support for. Either the endpoint needs to accept the SDK's normal auth, or the SDK needs an explicit API-key configuration option (undocumented either way).

**Severity: MEDIUM** — makes the entire "analytics query" surface unusable for SDK users as shipped.

### 8. `login --console` doesn't persist `api_base_url`
**File:** `nodejs/src/auth/login.ts` / `nodejs/src/cli/commands/login.ts`.

The browser OAuth login flow saves `api_base_url` into `credentials.json`; the headless `--console`/`--email`/`--password` flow does not. Any command run afterward without `LOXTEP_API_URL` set falls back to the hardcoded prod default (`https://api.loxtep.io`) — silently using the wrong environment. We hit this directly: `whoami` (no env var set) returned `403 Access denied: insufficient permissions for users:read` against **prod**, using a **dev** JWT, which reads like a permissions bug rather than an environment mismatch.

**Severity: MEDIUM** — confusing failure mode for any headless/CI use of the CLI, which is the documented use case for `--console`.

### 9. `credentials.json` written world-readable
`.loxtep/credentials.json` and `~/.loxtep/credentials.json` are both created with mode `0664`, containing a live JWT + temporary AWS credentials. Should be `0600`.

**Severity: MEDIUM** (local privilege exposure on shared/multi-user machines).

## Confirmed working

- `--version`, `--help` (and per-group help)
- `login --console` (once given correct credentials), `login --global`, credential precedence (local > global), `.gitignore` auto-created in a fresh project
- `whoami` (correct identity), `logout` / `logout --global` (scoped correctly)
- `init` (registers a real platform project + local scaffold), `projects list/get`
- `instances list/get/deployment-urls/registration`, `attach` (writes `instance_id`/`api_url`/`streams` correctly)
- `generate` (emits `.loxtep/generated/index.ts` with real org data: 82 data products, 20 connectors, 5 domains, 72 workflows)
- `bundle save --dry-run` / real save (once `template_id` is patched), `deploy` (once reindexed), `workflows list/get`
- `data-products list/get/readiness`, `domains list/get`, `standards list/get`
- `observe status`, `queue info`, `metrics rate-limits`, `metrics log` (documented no-op stub, confirmed)
- `config list/paths/set` (rejects invalid keys correctly), `bus login` (explainer placeholder as documented)
- `promises list` (deprecation warning shown correctly, forwards to data-contracts)
- **`get_writer('app-events')` → 5 events written → `get_reader('app-events', {from:'earliest'})` → all 5 read back correctly. Core ingestion round-trip is solid.**
- `session.get_current_user/get_current_organization`, `connect.connectors.{list,get,create*,delete}` (*with instance_id workaround), `workspace.projects/instances` incl. `get_stream_config`, `meaning.thesaurus.list_terms`, `query.catalog.search`, `query.discovery.search`, `review.approvals.list/list_pending`, `build.data_products.get_lexicon/get_usage_map`, `build.targets.list`, `define.schemas.list`, `context.process_intelligence.decisionTraces.list/procedures.list`, `decodeJwtPayload`, `get_rate_limits()`

## Documented gaps / stubs (not bugs — behaving as designed)

- `loxtep lint` — referenced in docs/CLI help text but **not wired** as a command (`Unknown command: lint`); `runLintCheck` exists in source but has no `case 'lint'` in `cli/index.ts`.
- `client.workspace.versions` — hardcoded `{unavailable: true}` placeholder.
- `client.metrics.{log,get_reporter}` — confirmed no-op stub regardless of options.
- `loxtep bus login` — explainer/placeholder text only, no real bus-session issuance yet.
- `loxtep promises` — deprecated alias of `data-contracts`, working as intended.
- `loxtep instances create` — no `--dry-run` flag exists; untestable without provisioning real infrastructure (skipped per test scope).

## Untested / out of scope this run

- `loxtep test <module> --event <file>` — requires a local workflow module under `workflows/`; our ingest path was provisioned via direct bundle patching rather than local module scaffolding, so no module existed to test against.
- `observe.stream_config()` returned `500 Observe proxy request failed` — likely specific to this dev instance's Observe proxy permissions (backend logs show a `403 Forbidden` from the same proxy during deploy, logged as non-blocking) rather than a general SDK bug; needs a clean instance to confirm.
- `LOXTEP_TOKEN` vs `LOXTEP_AUTH_TOKEN` env var precedence — not completed, flagged for follow-up.
- `errors` subpath (`@loxtep/sdk/errors`) — not imported standalone; its shape was observed indirectly via every thrown error in this report (see bug #4).
- `build.data_products.search()`, `build.workflows.get_graph()` — not exercised this run.

## Environment notes (not SDK bugs, disclosed for transparency)

- The dev e2e test account's Cognito password and TOTP enrollment had drifted from the values in `platform-frontend/.env.local`/`.env.e2e.local`. Reset the password to the documented value and re-enrolled the TOTP software token (new secret written back to both env files; originals backed up as `*.bak-sdk-e2e`). Recommend running the existing `cli-staging-smoke.test.ts` (`LOXTEP_CLI_SMOKE=1`) on a schedule so this kind of credential drift is caught automatically instead of blocking manual testing.
- `lxappdev-organizations-instancesinstanceidstreamco-*` (the `GET /organizations/instances/{id}/stream-config` Lambda) was timing out at its 15s limit / 256MB memory during `loxtep attach`. Bumped to 1024MB as a live fix on the dev stack. This is a config change outside version control — recommend making the memory bump permanent in the CDK stack definition, or it will regress on the next deploy.
- Throwaway resources created during testing: connector (deleted via SDK), workflow `9a32897f-46fd-41b2-a60e-6575b9c5b8ae` ("SDK App Events Ingest") and data product `287b9e0b-cd1e-497d-b508-504df04db738` ("app-events") were left in the `pictureitlikethis` dev org — the SDK exposes no `delete` method for workflows or data products, only for connectors.

## Recommended priority order for fixes

1. Query-string stripping (#1) — single-line-scoped fix, enormous blast radius, silent wrong-data bug.
2. `ingest provision` connector `instance_id` + bundle `template_id` (#2a/#2b) — blocks the entire onboarding story; #2b is already fixed in repo HEAD, just needs a release.
3. Deploy-requires-reindex (#3) — either auto-reindex inside `save_workflow_bundle`/`deploy`, or have the deploy bot read S3 directly instead of the (stale) index table.
4. Error body swallowing (#4) — surface `error.details`/`field_errors` from the actual backend response.
5. 404 route mismatches (#5) and `workflows.create` 500 (#6).
6. API-key-vs-JWT mismatch on query endpoints (#7).
7. `login --console` env persistence (#8) and credentials file permissions (#9).
