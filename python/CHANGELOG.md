# Changelog

All notable changes to `loxtep` (Python SDK) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
