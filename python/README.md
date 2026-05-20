# Loxtep Python SDK

Python client for the Loxtep API. Feature parity with the Node.js SDK:
**data_products**, **flows**, **workflows**, **observe**, **projects**,
**domains**, **standards** (policies), **data_contracts**, **connections**,
**queues**, **quality**, **catalog**, **discovery**, **schemas**,
**process_intelligence**. Analytics under **data_products** only (no standalone
analytics). No `get_leo_sdk` in public API.

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
| **data_products**                                            | get, list, search, query, list_tables, get_queue_info, get_reader_checkpoint, stream, replay                                                                                    |
| **flows**                                                    | list, get, create, get_writer                                                                                                                                                   |
| **connections**                                              | list, get, create, update, test                                                                                                                                                 |
| **queues**                                                   | get_queue_metadata, get_reader_checkpoint, open_reader, open_writer                                                                                                             |
| **quality**                                                  | list, get                                                                                                                                                                       |
| **catalog**                                                  | search                                                                                                                                                                          |
| **discovery**                                                | search (access-filtered; optional include_evidence, include_lineage), get_evidence, get_lineage_impact, get_governance_flags, run_discovery (all via `POST /ai/mcp/tools/call`) |
| **schemas**                                                  | get                                                                                                                                                                             |
| **projects**, **domains**, **standards**, **data_contracts** | list, get (stubs until APIs available)                                                                                                                                          |
| **process_intelligence**                                     | get_entity_context, decision_traces_list                                                                                                                                        |

All request/response fields use **snake_case** per backend conventions.

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

Config: `~/.loxtep/config.json` or env `LOXTEP_API_URL`,
`LOXTEP_ORGANIZATION_ID`, `LOXTEP_PROJECT_ID`.  
Auth: run `loxtep login` once or set `LOXTEP_TOKEN`.

See [docs/CLI.md](docs/CLI.md) for full CLI usage and for calling the Node.js
`loxtep` CLI from Python via subprocess.
