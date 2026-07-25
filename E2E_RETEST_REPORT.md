# @loxtep/sdk (Node.js) E2E Retest Report

**Date:** 2026-07-24 (retest, same day as original report)
**Environment:** dev (`https://apidev.loxtep.io`)
**Package tested:** `@loxtep/sdk@0.7.26` (published npm), installed into the same throwaway app
directory used for the original run (`/tmp/loxtep-sdk-e2e`), upgraded in place with `pnpm add
@loxtep/sdk@^0.7.26`. Re-verified npm hoisting behavior separately in `/tmp/loxtep-npm-check`.
**Account:** same e2e test user `testecomm@pictureitlikethis.com` (org `pictureitlikethis`).
**Baseline:** [`E2E_TEST_REPORT.md`](./E2E_TEST_REPORT.md), tested against `0.7.22`. Commits
`14944b4..d751640` (v0.7.23 → v0.7.26) landed between that report and this retest.

## Verdict

**Six of the nine original bugs are fixed. Two new critical bugs were found, and one of the
original bugs (the `/dataproducts` URL-doubling special case) turns out to be the real root
cause of two other "fixed" items — it's still broken and still blocks the documented golden
path, just later than before.**

Specifically: `loxtep deploy` and `loxtep generate` — both named explicitly in
`getting-started.md` Step 6/Step 7 — now hard-fail on **every** org, unconditionally, because the
SDK requests `page_size: 1000` for workspace-context list calls and the platform caps
`page_size` at 100. This wasn't visible in the original report because bug #1 (query strings
silently dropped) was masking it — the `page_size` never actually reached the backend before.
Fixing #1 unmasked this. A new user following the docs today gets further than before (past
`ingest provision`) but still cannot finish the golden path with the published package.

Separately, `import { LoxtepClient } from '@loxtep/sdk'` — the exact snippet in Step 8 of
`getting-started.md` — throws `Cannot find module 'ajv'` on any **pnpm** install (the package
manager the docs themselves tell users to use: `pnpm add @loxtep/sdk`). This is new in 0.7.24
(vendored entity schemas + Ajv). It does not reproduce under `npm`.

## Original bugs: status

| # | Bug | Status |
|---|-----|--------|
| 1 | Query strings silently dropped on every request | **Fixed** (0.7.25). Verified: `domains.list({page_size:1})` now returns exactly 1 item (was 5); `data_products.list({page_size:2})` returns exactly 2. |
| 2a | `ingest provision` connector missing `instance_id` on multi-instance orgs | **Fixed** (0.7.23). `loxtep ingest provision --name <x>` on our 6-instance org now resolves the instance and connector cleanly with no manual workaround. |
| 2b | `sdk-ingest-bundle` missing `template_id` | **Fixed**, and superseded — `ingest provision`/`create` is now local-first (0.7.24): it writes `connectors/`, `workflows/<id>/workflow.json`, `connections/*.json`, `data-products/*.json` locally and validates them, rather than calling `save_workflow_bundle` directly. `template_id` is present and lint-clean. |
| 3 | `deploy` silently no-ops until manual reindex | **Fixed as originally scoped** — the new `loxtep push` command bundles the local workspace *and* calls `projects.reindex` automatically (confirmed: `push` output includes `"reindex": {"data":{"success":true,"data":{"enqueued":true}}}`). No manual reindex call needed. **However, `deploy` itself is now blocked by new bug A below**, so the golden path still doesn't complete end-to-end. |
| 4 | SDK swallows the real backend error body | **Fixed** (0.7.25). Validation errors now surface a structured `details` array with `field`/`message`/`code` per failing field (confirmed on `data_contracts.list` and the `deploy` page_size failure below), instead of just `message: "Validation Error"`. |
| 5 | Dead SDK methods (404s): `triggers.list/create`, `improvements.list`, `activity.list`, `list_tables`, `get_reader_checkpoint` | **Mixed** — see breakdown below. |
| 6 | `workflows.create` 500s with leaked raw SQL | **Fixed.** `client.build.workflows.create({...})` now returns a proper workflow object, no 500, no leaked SQL. CLI help (`loxtep workflows create --help`) now documents `--workflow-type` and `--domain-id` as options, closing the docs gap too. |
| 7 | `data-products query` / `query.query()` needs an API key the SDK never sends | **Not fixed, and the diagnosis has changed** — see new bug B below. Today it 404s, not 401s; root cause is the same `/dataproducts` URL-doubling bug as #5's `list_tables`. |
| 8 | `login --console` doesn't persist `api_base_url` | **Fixed** (0.7.25). Confirmed `.loxtep/credentials.json` now includes `api_base_url: "https://apidev.loxtep.io"` after console login, and `whoami --debug` with `LOXTEP_API_URL` unset correctly targets dev. |
| 9 | `credentials.json` written world-readable (0664) | **Fixed** (0.7.25). Confirmed `.loxtep/credentials.json` is mode `0600` after a fresh login. |

### Bug #5 breakdown (route-by-route)

| SDK method | Old result | New result |
|---|---|---|
| `build.triggers.list()` | 404 (called `/workflows/connections`) | **Fixed.** Now requires `project_id` explicitly (`triggers.list requires project_id`) — CLI (`loxtep triggers list`) already supplies it automatically and works. Calling the SDK method directly without `project_id` now fails with a clear error instead of a 404, which is arguably correct/intended given the 0.7.26 "project entities" rework. |
| `build.triggers.create()` | 404 | Not independently re-tested (list confirms the route family now resolves under `/workflows/projects/{id}/entities/.../connections` per changelog); low risk given `list` works. |
| `review.improvements.list()` | 404 | **Route fixed**, but now returns `403 Access denied: insufficient permissions for improvements:read` for our `super_admin`-role test user, whose permission list (dumped via `whoami --debug`) does not include `improvements:read`. This looks like a backend RBAC config gap, not an SDK bug — flagging for awareness, not attributing to the SDK. |
| `context.activity.list()` | 404 | Same as above — **route fixed**, now `403` (`activity:read`/`audit:read` not granted to super_admin on this org). Backend RBAC issue, not SDK. |
| `build.data_products.list_tables()` | 404 (`GET /dataproducts/{id}/tables`) | **Still 404**, different mechanism now: SDK calls `/dataproducts/warehouse/tables`, which `buildPlatformRequestUrl` doubles to `/dataproducts/dataproducts/warehouse/tables` — the backend route is `platform-backend/dataproducts/api/warehouse/tables/GET` (single `/dataproducts/warehouse/tables`, not nested). See new bug B. |
| `observe.get_reader_checkpoint()` | 404 | **Fixed.** Returns `{"queue_name":{...},"checkpoint":""}` correctly now. |

## New bugs found on 0.7.26

### A. `deploy` / `generate` hard-fail on every org: `page_size: 1000` exceeds the platform's max of 100

**File:** `nodejs/src/codegen/load-workspace-context.ts`

```ts
client.build.data_products.list({ page: 1, page_size: 1000 }),
client.connect.connectors.list({ page: 1, page_size: 1000 }),
client.define.domains.list({ page: 1, page_size: 1000 }),
client.build.workflows.list({ project_id: projectId, page: 1, page_size: 1000 }),
```

The backend's list schemas cap `page_size` at 100 (`"maximum": 100`, zod `too_big`). Before 0.7.25,
bug #1 silently stripped this query param, so the backend never saw `page_size=1000` and the
request succeeded with whatever default page size the backend applies — masking this bug
entirely. Now that #1 is fixed and query strings actually reach the backend, every call to
`loadWorkspaceContext()` — used by **both** `loxtep deploy` and `loxtep generate` — fails
immediately:

```
Deploy failed: could not retrieve workspace context: [
  { "origin": "number", "code": "too_big", "maximum": 100, "inclusive": true,
    "path": ["page_size"], "message": "Too big: expected number to be <=100" }
]
```

Reproduced identically for `generate`. This is not org-specific — it's a hardcoded literal
exceeding a hardcoded backend limit, so it fails for every account, every time.

**Impact on the golden path:** `getting-started.md` Step 6 (`ingest provision → lint → deploy →
data-products list`) and Step 5 (`generate`) are both named explicitly in the docs and both
broken. A brand-new user following the docs verbatim on `0.7.26` gets through login, init,
attach, and `ingest provision`/`lint` (all now working) and then hits a hard stop at `deploy` —
the data product they just provisioned never gets published (`data-products get <id>` on the
newly-provisioned one 404s: `Data product not found`), so `get_writer()` against it would fail
too. (Confirmed working against a *previously*-deployed data product from the original test run
— see Round-trip section below — but not against anything provisioned during this retest.)

**Severity: CRITICAL** — regression, blocks the entire documented golden path, same class of
severity as the original bug #1/#2/#3 chain. Needs pagination (loop until `has_more` is false, or
just lower the requested page size to ≤100) in `loadWorkspaceContext`.

### B. `/dataproducts` URL-doubling special case is over-broad — breaks most `/dataproducts/*` sub-resources

**File:** `nodejs/src/config/platform-request-url.ts`

```ts
if (first === 'dataproducts') {
  return `${host}/dataproducts/dataproducts${p.slice('/dataproducts'.length)}${search}`;
}
```

This unconditionally doubles `dataproducts` for **any** path starting with `/dataproducts`. That's
only correct for the bare `/dataproducts` CRUD resource itself and for `/dataproducts/usage-map`
(which really does live at `platform-backend/dataproducts/api/dataproducts/usage-map/GET` — nested
one level deeper). It's wrong for every sibling resource that lives directly under the
`dataproducts` microservice root:

| SDK path | Doubled to (wrong) | Actual backend route | Confirmed |
|---|---|---|---|
| `/dataproducts/warehouse/tables` (`list_tables`) | `/dataproducts/dataproducts/warehouse/tables` | `platform-backend/dataproducts/api/warehouse/tables/GET` → `/dataproducts/warehouse/tables` | 404 live |
| `/dataproducts/warehouse/execute` (`query.query`) | `/dataproducts/dataproducts/warehouse/execute` | `platform-backend/dataproducts/api/warehouse/execute/POST` → `/dataproducts/warehouse/execute` | 404 live |
| `/dataproducts/datacontracts` (`data_contracts.list`) | `/dataproducts/dataproducts/datacontracts` | `platform-backend/dataproducts/api/datacontracts/GET` | 400 "must be a valid UUID" live (misroute manifests as a validation error, not a 404, because a different handler on that doubled path still exists and validates a param that was never really sent correctly) |
| `/dataproducts/quality-metrics` (`quality.list`) | `/dataproducts/dataproducts/quality-metrics` | `platform-backend/dataproducts/api/quality-metrics/GET` | same 400 pattern, not independently curled but same code path as datacontracts |
| `/dataproducts/templates` (`templates.list`) | `/dataproducts/dataproducts/templates` | `platform-backend/dataproducts/api/templates/GET` | not live-tested this run, same code path |

This is the real, still-unfixed root cause behind:
- Original bug #5's `list_tables` 404 (misdiagnosed in the original report as a possibly-missing
  backend feature — it isn't; the route exists, the SDK builds the wrong URL).
- Original bug #7 (`query.query()` "requires an API key") — retested live today and it does
  **not** 401 anymore, it 404s, with the same doubled-path signature as `list_tables`. The
  API-key theory from the original report doesn't match current behavior; recommend re-scoping
  that bug to this URL-building issue rather than an auth gap.
- The `data_contracts.list` / `quality.list` UUID-validation confusion noted in the original
  report's raw findings (folded into bug #1's writeup there, but it's a separate defect in
  `buildPlatformRequestUrl`, orthogonal to the query-string-stripping fix).

**Severity: HIGH** — six known call sites, at least two of which (`list_tables`, `query.query`)
are core documented "analytics" surface. The special case needs to be narrowed to the literal
`/dataproducts` resource path (and `/dataproducts/usage-map`), not a prefix match.

### C. `import { LoxtepClient } from '@loxtep/sdk'` crashes under pnpm: `Cannot find module 'ajv'`

**File:** `nodejs/src/lib/entity-json-schemas/validate-entity.ts` (`loadAjv()`, new in 0.7.24)

`loadAjv()` looks for `ajv-loader.cjs` by walking up to 8 parent directories from
`process.argv[1]`, expecting to find `<root>/dist/lib/entity-json-schemas/ajv-loader.cjs`. This
works when `process.argv[1]` is the CLI's own entry point (`.../node_modules/@loxtep/sdk/dist/cli/index.js`
— walking up stays inside the package). It does **not** work when a consuming application
imports the SDK as a library from its own script, which is exactly what `getting-started.md`
Step 8 tells users to do:

```ts
import { LoxtepClient } from '@loxtep/sdk';
```

Here `process.argv[1]` is the *consumer's* entry file (e.g. `/my-app/src/index.mjs`), so the
upward walk never reaches into `node_modules/@loxtep/sdk/dist/...`. `loadAjv()` falls back to
`createRequire(join(process.cwd(), 'package.json')).require('ajv')` — but `ajv` is a transitive
dependency of `@loxtep/sdk`, not a direct dependency of the consumer app, and pnpm's default
strict (non-hoisted) `node_modules` layout does not expose transitive deps at the project root.
Result, on a completely vanilla `pnpm add @loxtep/sdk` install:

```
Error: Cannot find module 'ajv'
Require stack:
- /tmp/loxtep-sdk-e2e/package.json
    at .../validate-entity.js:41:20 (loadAjv)
```

This is a **module-load-time** crash — it happens on the bare `import`, before any SDK method is
called, so there is no user-facing workaround except manually adding `ajv`/`ajv-formats` as
direct dependencies of the consuming app (confirmed this masks it: `pnpm add ajv ajv-formats`
in the throwaway app made the import succeed). Confirmed **not** reproducible under plain `npm
install` (npm's default hoisting puts `ajv` at the project's top-level `node_modules`, where the
`process.cwd()`-relative `require('ajv')` fallback can find it) — verified in a fresh
`/tmp/loxtep-npm-check` directory with `npm install @loxtep/sdk@0.7.26`.

**Severity: CRITICAL** — pnpm is the package manager the SDK's own docs instruct users to use
(`pnpm add @loxtep/sdk` is the first command in `getting-started.md`), and this breaks the
single most basic library usage (`import { LoxtepClient }`) documented in Step 8. Root cause is
that `loadAjv()`'s "find our own package root" strategy is import-site-relative
(`process.argv[1]`) instead of module-relative. The fix is straightforward: resolve `ajv` the
same way `ajv-loader.cjs` itself does when it's found (`createRequire` anchored to
`import.meta.url` / `__filename` of `validate-entity.ts` itself, not the process entry point) —
Node's module resolution will then walk up from the SDK's own `dist/` through the SDK's own
`node_modules` symlink (confirmed present: `.pnpm/@loxtep+sdk@0.7.26.../node_modules/ajv ->
../../ajv@8.20.0/node_modules/ajv`) regardless of who imports it or from where.

## Round-trip (core promise)

Re-verified using the data product from the *original* test run (`app-events`,
`287b9e0b-cd1e-497d-b508-504df04db738`, still `active`/deployed from the prior session — nothing
provisioned in *this* retest reached "deployed" state due to bug A):

```
writer.write({ event: 'retest', marker: 'e2e-retest-1784941448653', seq: 0..2 })
reader (fresh bot_id, from: 'earliest') → event #6 in the queue is exactly the write above,
payload intact.
```

**Still solid.** First attempt with a brand-new reader immediately after writing only saw 5 of 6
events (simple read-after-write propagation delay, not a bug); a moment later a second fresh
reader saw all 6, including the new one, with the correct payload. No data loss, no corruption.

## Unchanged / not retested

- `DEP0187` deprecation warning (`Passing invalid argument types to fs.existsSync`) still fires
  on every CLI invocation. Cosmetic, not in either report's bug list, still present.
- `build.triggers.create()`, `data_contracts`/`quality`/`templates` full CRUD, `improvements`/
  `activity` RBAC gap — not independently exercised beyond what's above; low incremental risk
  given the shared root causes already confirmed.
- Everything in the original report's "Confirmed working" list not called out above was not
  re-run this pass (out of scope for a targeted regression retest) — no reason to expect
  regressions there.

## Follow-up fix: `loxtep deploy` didn't activate SDK-first workflows (v0.7.28)

Fixed in this branch: `deploy-cmd.ts` only ever looked for flat `.ts`/`.js` files under
`workflows/` (the code-first-cli flow's shape). SDK-first packages
(`ingest`/`transform`/`delivery create`, `push`) write `workflows/<id>/workflow.json`
*directories* instead — invisible to that scan — so `deploy` printed `No workflow modules found
in workflows/. Nothing to deploy.` even after a successful `provision`/`lint`/`push`. Added
`deployLocalEntityWorkflows()`, which pushes (`save_workflow_bundle`) + reindexes + activates
(`workflows.deploy`) any local JSON-entity packages when no `.ts`/`.js` modules are found —
the same three-call sequence `loxtep ingest create --deploy` already used successfully. `loxtep
deploy` alone now finishes the job for both flows; unit + integration tests added
(`deploy-cmd.test.ts`, `cli-local-integration.test.ts`).

**Live verification turned up two issues outside this repo's scope, not fixed here:**

1. **Backend regression blocks confirming end-to-end materialization right now.**
   `client.build.workflows.get(id)` 500s on *any* workflow_id on the dev environment
   (`apidev.loxtep.io`) — including workflows that materialized successfully hours earlier in the
   original test session — with a leaked raw SQL error: `Undefined binding(s) detected when
   compiling FIRST. Undefined column(s): [workflow_id] query: select * from "workflows" where
   "workflow_id" = ? and "deleted_at" is null limit ?`. This is the same *class* of bug as the
   original report's #6 (leaked SQL), but on a different endpoint, and it reproduces identically
   through the already-proven-working `ingest create --deploy` path — not something introduced by
   this fix. With this endpoint down, deploy's activation call returns `{status: "requested",
   message: "Project deployment requested"}` (async) but the data product never materializes
   within ~1 minute of polling, for either the new `deploy` branch or the reference
   `ingest --deploy` path. Root cause is backend-side; needs a platform-team fix, not an SDK
   change. The write/read round-trip against the *previously*-materialized `app-events` data
   product (from the original session) still works, confirming the core promise is unaffected.
2. **New SDK bug found via the `triggers.create()` coverage check:** `client.build.triggers.create()`
   (`nodejs/src/client/triggers.ts:128-158`) builds its PUT body without an `organization_id`
   field, but the backend's connection entity schema requires one — every call 400s with
   `Entity validation failed: must have required property 'organization_id'`, regardless of what
   the caller passes (the method doesn't accept an `organization_id` param at all). Not fixed
   here — flagged as a new, separate finding since it wasn't part of the approved fix scope.

## Fix verification (post-retest)

All three new bugs (A, B, C) were fixed in this branch and re-verified live against dev with a
packed tarball (`npm pack` → `pnpm add file:...tgz` in the throwaway app, no ajv/ajv-formats
workaround installed):

- **Bug A** (`page_size: 1000`): `nodejs/src/codegen/load-workspace-context.ts` now paginates at
  the platform max (100) via a `fetchAllPages` loop instead of requesting one oversized page.
  `loxtep generate` now completes (`Data products: 83, Connectors: 24, Domains: 5` on the test
  org) instead of throwing the `page_size` `too_big` error. `loxtep deploy` no longer crashes on
  this error either — it now gets past workspace-context loading and reports its own (separate,
  **not** one of the three scoped bugs) `No workflow modules found in workflows/` outcome, because
  `deploy-cmd.ts` scans `workflows/` for `.ts`/`.js` module *files*, which is the code-first-cli
  flow's artifact shape, not the JSON entity directories (`workflows/<id>/workflow.json`) that
  `ingest provision`/`push` write for the SDK-first flow. Flagging this as a new, distinct
  follow-up — not fixed here, out of scope for what was asked.
- **Bug B** (`/dataproducts` doubling): `platform-request-url.ts` now only doubles for the
  `dataproducts` resource itself; sibling resources (`datacontracts`, `quality-metrics`,
  `quality-rules`, `templates`, `warehouse`, `alerts`, `lineage`, `exports`,
  `connector-packages`, `openmetadata`, `agents`, `ai`) pass through undoubled. Live-verified:
  `data_contracts.list()` and `quality.list()` no longer reject a real UUID as invalid;
  `data_products.list_tables()` now returns real table data instead of 404;
  `client.query.query(dataProductId, sql)` now executes successfully instead of 404ing (the
  original bug #7 "needs an API key" diagnosis doesn't apply — it was always this routing bug).
- **Bug C** (`ajv` under pnpm): `validate-entity.ts` now loads `ajv-loader.cjs` via a plain
  relative `import ... = require('./ajv-loader.cjs')` (TypeScript's supported CJS-interop-in-ESM
  syntax) instead of searching `process.argv`/`process.cwd()`; `ajv-loader.cjs` also now exports
  `packageRoot` (derived from its own `__dirname`) so `resolveSchemasDir()` no longer needs the
  search either. Live-verified: `import { LoxtepClient } from '@loxtep/sdk'` succeeds on a fresh
  `pnpm add` install with no direct `ajv`/`ajv-formats` dependency in the consumer app.

Full Node SDK test suite (106 suites / 850 tests, 2 pre-existing skips) passes, plus new/updated
tests: `platform-request-url.test.ts` (sibling-resource non-doubling cases),
`load-workspace-context.test.ts` (pagination loop, asserts `page_size` never exceeds 100). Three
CLI integration tests (`data-contracts create/list/get`) needed their mock server routes updated
to match the corrected (undoubled) URLs — those mocks had been asserting the old, buggy behavior.

## Recommended priority order for fixes

1. **Bug A** (`page_size: 1000` in `loadWorkspaceContext`) — one-line-scoped, blocks `deploy` and
   `generate` unconditionally for every org. Highest priority; this is strictly worse than the
   original bug #3 since there's no manual workaround available to users.
2. **Bug C** (`ajv` resolution under pnpm) — blocks basic library `import` for the exact package
   manager the docs recommend. Fix is scoped to `loadAjv()`'s resolution strategy.
3. **Bug B** (`/dataproducts` doubling over-broad) — narrow the special case; fixes `list_tables`,
   `query.query`, `data_contracts`, `quality`, `templates` in one change.
4. RBAC gap on `improvements:read` / `activity:read` for `super_admin` — flag to backend/platform
   team, not an SDK-side fix.
