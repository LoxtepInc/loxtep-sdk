# Changelog

All notable changes to `@loxtep/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
