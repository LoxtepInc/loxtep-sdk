# Changelog

All notable changes to `@loxtep/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
