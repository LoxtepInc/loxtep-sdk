# Loxtep Python SDK

Python client for the Loxtep API.

**Available namespaces:** `data_products`, `delivery`, `flows`, `workflows`,
`observe`, `projects`, `templates`, `connectors`, `instances`, `procedures`,
`connections`, `queues`, `quality`, `catalog`, `discovery`, `schemas`,
`process_intelligence`. Stubs (limited functionality): `domains`, `standards`,
`data_contracts`, `metrics`.

> **Not yet available from Node.js SDK:** `thesaurus`, `config`, `auth`,
> `codegen`, `skills`, `authoring`, `http`, `checkpoint` modules. Analytics
> under `data_products` only (no standalone analytics).

## Install

```bash
pip install -e .
# or from repo root: pip install -e sdks/python
```

## Quick start

### Sync client

```python
from loxtep import LoxtepClient

client = LoxtepClient(
    api_url="https://api.loxtep.com",
    auth={"type": "jwt", "token": "YOUR_JWT"},
    organization_id="org-id",
    project_id="project-id",
)

# Data products
asset = client.data_products.get("data-product-id")
items, pagination = client.data_products.list(page=1, page_size=20)
results = client.data_products.query("data-product-id", "SELECT * FROM t LIMIT 10")
tables = client.data_products.list_tables("data-product-id")

# Delivery interfaces (how data products deliver data externally)
interfaces = client.delivery.list("data-product-id")
client.delivery.create("data-product-id", delivery_type="webhook", endpoint_url="https://example.com/hook", method="POST")
interface = client.delivery.get("data-product-id", "delivery-id")
client.delivery.update("data-product-id", "delivery-id", is_active=False)
client.delivery.delete("data-product-id", "delivery-id")

# Flows (project-scoped)
flows_data = client.flows.list(project_id="project-id")
flow_with_nodes = client.flows.get("flow-id")
writer = client.flows.get_writer("flow-id")
writer.write({"id": "e1", "payload": {"name": "Alice"}})
writer.close()

# Connections, queues, quality, catalog, discovery, schemas
conns = client.connections.list()
meta = client.queues.get_queue_metadata("queue-name")
client.quality.list()
client.catalog.search("query")
# Discovery (access-filtered when user context present): search, get_evidence, get_lineage_impact, get_governance_flags, run_discovery
client.discovery.search("events", include_evidence=True)
client.schemas.get("data-product-id")

client.close()
```

### Async client

```python
import asyncio
from loxtep import AsyncLoxtepClient

async def main():
    async with AsyncLoxtepClient(
        api_url="https://api.loxtep.com",
        auth={"type": "jwt", "token": "YOUR_JWT"},
    ) as client:
        asset = await client.data_products.get("data-product-id")
        flows_data = await client.flows.list(project_id="project-id")
        async for event in client.data_products.stream("data-product-id"):
            print(event)

asyncio.run(main())
```

## Quick start: "Tell me everything about this order"

Process Intelligence returns unified context from all connected systems
(Shopify, Stripe, Gorgias, etc.) for a given entity:

```python
from loxtep import LoxtepClient

client = LoxtepClient(
    api_url="https://api.loxtep.com",
    auth={"type": "jwt", "token": "YOUR_JWT"},
    organization_id="org-id",
)

# Tell me everything about order #4821
context = client.process_intelligence.get_entity_context(
    "org-id", "order", "4821"
)
print(context)  # Shopify order + Stripe payments + support tickets, etc.
```

See
[Process Intelligence API Guide](../../docs/api/process-intelligence-guide.md)
for full API and MCP tool reference.

## API surface

| Surface                                                      | Methods                                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **data_products**                                            | get, list, create_data_product, get_usage_map, search, query, list_tables, get_queue_info, get_reader_checkpoint, stream, replay                                                |
| **delivery**                                                 | list, get, create, update, delete                                                                                                                                               |
| **flows**                                                    | list, get, create, get_writer                                                                                                                                                   |
| **connections**                                              | list, get, create, update, delete, test                                                                                                                                         |
| **queues**                                                   | get_queue_metadata, get_reader_checkpoint, open_reader, open_writer                                                                                                             |
| **quality**                                                  | list, get (read-only; create/update/delete via MCP only)                                                                                                                        |
| **catalog**                                                  | search                                                                                                                                                                          |
| **discovery**                                                | search (access-filtered; optional include_evidence, include_lineage), get_evidence, get_lineage_impact, get_governance_flags, run_discovery (all via `POST /ai/mcp/tools/call`) |
| **schemas**                                                  | get                                                                                                                                                                             |
| **connectors**                                               | list, get, create, update, delete, test, get_oauth_url                                                                                                                          |
| **workflows**                                                | list_workflows, get_workflow_graph, create_workflow, deploy                                                                                                                      |
| **templates**                                                | list_templates, get_template                                                                                                                                                    |
| **instances**                                                | list, get                                                                                                                                                                       |
| **procedures**                                               | list                                                                                                                                                                            |
| **projects**                                                 | list_projects, get_project, create_project, update_project, delete_project, apply_template                                                                                      |
| **observe**                                                  | status (Node.js SDK has additional observe methods not yet in Python)                                                                                                           |
| **domains** ⚠️                                               | list, get — *stub: limited functionality, returns empty data*                                                                                                                   |
| **standards** ⚠️                                             | list, get — *stub: limited functionality, returns empty data*                                                                                                                   |
| **data_contracts** ⚠️                                        | list, get — *stub: limited functionality, returns empty data*                                                                                                                   |
| **metrics** ⚠️                                               | log, get_reporter — *stub: not yet available, methods are no-ops*                                                                                                               |
| **process_intelligence**                                     | get_entity_context, decision_traces_list                                                                                                                                        |

All request/response fields use **snake_case** per backend conventions.

### `client.connectors`

| Method | Description |
| --- | --- |
| `list(*, organization_id, connector_type, page, page_size, sort_by, sort_order)` | List connectors with optional filtering and pagination |
| `get(connector_id)` | Get a single connector by ID |
| `create(connector_type, *, metadata)` | Create a new connector |
| `update(connector_id, *, connector_type, metadata)` | Update an existing connector |
| `delete(connector_id)` | Delete a connector |
| `test(connector_id)` | Test connector connectivity |
| `get_oauth_url(connector_id, *, callback_url, toolkit)` | Get the OAuth authorization URL for a connector |

### `client.workflows`

| Method | Description |
| --- | --- |
| `list_workflows(project_id, *, page, page_size, status, search)` | List workflows for a project |
| `get_workflow_graph(workflow_id, project_id)` | Get the workflow graph definition |
| `create_workflow(input)` | Create a new workflow (pass dict with project_id, name, etc.) |
| `deploy(project_id, instance_id, *, version_id, force_redeploy)` | Deploy a project to an instance |

### `client.templates`

| Method | Description |
| --- | --- |
| `list_templates(*, category, search, page, page_size)` | List available templates with optional filtering |
| `get_template(template_id)` | Get a template by ID |

### `client.instances`

| Method | Description |
| --- | --- |
| `list()` | List all runtime instances for the organization |
| `get(instance_id)` | Get a single instance by ID |

### `client.procedures`

| Method | Description |
| --- | --- |
| `list(organization_id, *, page, page_size)` | List procedures for an organization |

### `client.projects`

| Method | Description |
| --- | --- |
| `list_projects(*, status, search, page, page_size)` | List projects in the organization |
| `get_project(project_id)` | Get a single project by ID |
| `create_project(name, *, description, status, metadata, configuration, template_slug, domain_id, ...)` | Create a new project |
| `update_project(project_id, *, name, description, status, metadata, configuration, ...)` | Update an existing project |
| `delete_project(project_id)` | Delete a project |
| `apply_template(project_id, *, template_type, template_slug, preview, placeholder_overrides)` | Apply a template to a project |

### `client.observe`

| Method | Description |
| --- | --- |
| `status()` | GET /observe/bots — returns bot/queue observability summary |

> **Note:** The Node.js SDK has additional observe methods not yet available in
> Python.

### `client.data_products`

| Method | Description |
| --- | --- |
| `get(id, *, include_schema, include_quality)` | Get a data product by ID |
| `list(*, page, page_size, domain_id, status, kind, sort_by, sort_order)` | List data products |
| `create_data_product(*, name, kind, description, domain, **kwargs)` | Create a new data product (`kind` is required: `'source'` or `'consumer'`) |
| `get_usage_map()` | Fetch the Data Product Usage Map showing source→consumer relationships |
| `search(query, *, type, limit, offset)` | Search data products |
| `query(id, sql)` | Run SQL against a data product |
| `list_tables(id)` | List tables in a data product |
| `get_queue_info(id)` | Get queue info for a data product |
| `get_reader_checkpoint(id, bot_id)` | Get reader checkpoint for a bot |
| `stream(id, *, start, batch_size)` | Stream events from a data product (sync generator) |
| `replay(id, *, start, batch_size)` | Replay events from a data product (sync generator) |

### `client.delivery`

Manage delivery interfaces — how data products deliver data to external systems
(webhooks, API endpoints, exports, database syncs, BI connections, event streams).

| Method | Description |
| --- | --- |
| `list(data_product_id, *, page, page_size, status, is_active)` | List delivery interfaces for a data product |
| `get(data_product_id, delivery_id)` | Get a single delivery interface |
| `create(data_product_id, delivery_type="webhook", **kwargs)` | Create a new delivery interface |
| `update(data_product_id, delivery_id, **kwargs)` | Update an existing delivery interface |
| `delete(data_product_id, delivery_id)` | Delete a delivery interface |

**`DeliveryInterface` model fields:**
`consumption_id`, `data_product_id`, `organization_id`, `delivery_type`,
`delivery_method`, `status`, `is_active`, `endpoint_url`, `method`, `name`,
`description`, `headers`, `filters`, `configuration`, `metadata`,
`created_at`, `updated_at`.

**`delivery_type` values:** `webhook`, `api_endpoint`, `export`,
`database_sync`, `bi_connect`, `event_stream`.

> **Terminology Migration:** `client.consumptions` is a deprecated alias for
> `client.delivery`. It proxies all calls and logs a deprecation warning on
> first use. The `Consumption` model is a deprecated alias for
> `DeliveryInterface`. Both will be removed no sooner than 6 months after this
> release. See `/docs/reference/terminology-changes` for the full mapping.

### `client.domains` ⚠️ stub

> **Stub — limited functionality.** `domains` is a placeholder with no backend
> API. `list` returns empty results; `get` raises `NotImplementedError`.

### `client.standards` ⚠️ stub

> **Stub — limited functionality.** `standards` (policies) is a placeholder
> with no backend API. `list` returns empty results; `get` raises
> `NotImplementedError`.

### `client.data_contracts` ⚠️ stub

> **Stub — limited functionality.** `data_contracts` is a placeholder with no
> backend API. `list` returns empty results; `get` raises
> `NotImplementedError`.

### `client.metrics` ⚠️ stub

> **Stub — not yet available.** `metrics` methods are no-ops.

| Method | Description |
| --- | --- |
| `log(metric)` | No-op — intended for metric ingestion (not yet available) |
| `get_reporter()` | No-op — returns `None` (not yet available) |

## Type hints

Types are hand-written; all public methods and responses use type hints. Run
`mypy src/loxtep` for static checking.

## CLI

After `pip install -e .` you get a `loxtep` command:

- **login** – runs Node.js `loxtep login` (requires Node/npx); writes
  credentials to `~/.loxtep/credentials.json`
- **query** – run SQL in a data product context (Python SDK)
- **stream** – stream events from a data product (Python SDK)
- **replay** – replay events from a data product (Python SDK)
- **workflows list** – list workflows for a project (Python SDK)
- **workflows deploy** – deploy a project to an instance (Python SDK)
- **observe status** – show bot/queue status from the Observe API (Python SDK)
- **projects list** – list projects in the organization (Python SDK)
- **projects get** – get a single project by ID (Python SDK)
- **templates list** – list available templates (Python SDK)
- **templates get** – get a template by ID (Python SDK)
- **config export** – export SDK bootstrap config from a connector (Python SDK)

Config: `~/.loxtep/config.json` or env `LOXTEP_API_URL`,
`LOXTEP_ORGANIZATION_ID`, `LOXTEP_PROJECT_ID`.  
Auth: run `loxtep login` once or set `LOXTEP_TOKEN`.

See [docs/CLI.md](docs/CLI.md) for full CLI usage and for calling the Node.js
`loxtep` CLI from Python via subprocess.
