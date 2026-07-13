# Changelog

All notable changes to `loxtep` (Python SDK) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
