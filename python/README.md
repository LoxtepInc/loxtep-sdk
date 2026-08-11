# Loxtep Python SDK

Python client for the Loxtep API, organized around one journey: **ingest →
define → deliver**. Reach for the namespace that matches the stage you're in:

- **Ingest** — `triggers`, `connectors`, `workflows`, `data_products.get_writer`
- **Define** — `data_products`, `schemas`, `quality`, `catalog`, `discovery`,
  `thesaurus`, `domains`, `standards`, `data_contracts`
- **Deliver** — `data_products` (get_reader/stream/replay/query), `targets`
- **Advanced / platform** — `projects`, `templates`, `instances`, `observe`,
  `queues`, `metrics`*, `process_intelligence`

<sub>* `metrics` is a no-op reporter — matching the Node.js SDK, where it is
also a no-op stub.</sub>

The namespace names, casing, method names, and journey grouping match the
Node.js SDK — see **Parity with the Node.js SDK** at the bottom.

> **Stream bus:** `loxtep.rstreams` is a native Leo data-plane client (Kinesis
> **write** + DynamoDB/S3 **read**). Enable it with `pip install loxtep[streams]`
> and pass `streams=` (or set `LEO_*` env), or use `from_workspace()` after Node
> `loxtep attach` (writes `streams` into `.loxtep/project.json`).
>
> **Not yet ported from the Node.js SDK:** skills / workflow authoring helpers.
> Codegen (`loxtep generate`) and workspace auto-config (`from_workspace`) are
> native Python. rstreams follow-ups: S3 byte-range fast-read, snapshot/archive
> queue transitions.

## Install

```bash
pip install -e .
# or from repo root: pip install -e sdks/python
```

## Login from code

Mint an **`sdk_python`** session (isolated from CLI, web, Node SDK, and MCP):

```python
from loxtep import LoxtepClient, login, browser_login

api_url = "https://api.loxtep.io"  # or apidev.loxtep.io

# Email / password (optional mfa_code=...). Defaults to client_channel="sdk_python".
tokens = login(api_url, "you@co.com", "secret")
# Or browser handoff → /auth/sdk?runtime=python:
# tokens = browser_login("https://app.loxtep.io")

client = LoxtepClient(
    api_url=api_url,
    auth={"type": "jwt", "token": tokens["access_token"]},
)
```

Refresh with `from loxtep import refresh` then
`refresh(api_url, tokens["refresh_token"])`. For CLI credentials on disk, keep
using Node `loxtep login` (that mints a **CLI** session) +
`LoxtepClient.from_workspace()`.

## Quick start

### Sync client (workspace auto-config)

After Node CLI `login` → `init` → `attach` (writes `.loxtep/project.json` +
credentials):

```python
from loxtep import LoxtepClient

client = LoxtepClient.from_workspace()
writer = client.get_writer("app-events")
writer.write({"user_id": "u_1", "action": "signup"})
writer.close()
client.close()
```

See **[Write to a data product](docs/sdk-first-ingest.md)** for the full flow.

### Sync client (explicit config)

```python
from loxtep import LoxtepClient

client = LoxtepClient(
    api_url="https://api.loxtep.com",
    auth={"type": "jwt", "token": "YOUR_JWT"},
    organization_id="org-id",
    project_id="project-id",
)

# --- Ingest: connect a source and write events ---
triggers = client.triggers.list()
# With stream config (streams= / LEO_* env + pip install loxtep[streams]) this
# writer produces to the Kinesis bus; otherwise it uses the HTTP data path.
writer = client.data_products.get_writer("my-data-product")  # resolves name→id
writer.write({"id": "e1", "name": "Alice"})
writer.close()

# Workflows (the ingestion → transformation → export DAG)
workflows = client.workflows.list(project_id="project-id")
graph = client.workflows.get_graph("workflow-id", "project-id")

# --- Define: data products, schema, quality, discovery ---
asset = client.data_products.get("data-product-id")
items, pagination = client.data_products.list(page=1, page_size=20)
results = client.data_products.query("data-product-id", "SELECT * FROM t LIMIT 10")
client.quality.list()
client.catalog.search("query")
# Discovery (access-filtered when user context present)
client.discovery.search("events", include_evidence=True)
client.schemas.get("data-product-id")

# --- Deliver: consume events and route data out ---
for event in client.data_products.stream("data-product-id"):
    print(event)

# Targets — how a data product delivers data to external systems
client.targets.list("data-product-id")
client.targets.create(
    "data-product-id",
    target_type="webhook",
    endpoint_url="https://example.com/hook",
    method="POST",
)

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
        workflows = await client.workflows.list(project_id="project-id")
        async for event in client.data_products.stream("data-product-id"):
            print(event)

asyncio.run(main())
```

## API surface

Grouped by journey stage; kind labels: **Resource** (full CRUD), **Reference**
(read-only), **Runtime** (live stream I/O).

### Ingest

| Surface | Kind | Methods |
| --- | --- | --- |
| **triggers** | Resource | `get`, `list`, `create`, `update`, `delete`, `test` |
| **connectors** | Resource | `list`, `get`, `create`, `update`, `delete`, `test`, `get_oauth_url` |
| **workflows** | Resource | `list`, `get`, `create`, `get_graph`, `deploy` |
| **data_products.get_writer** | Runtime | the write path for events (resolves name→id) |

### Define

| Surface | Kind | Methods |
| --- | --- | --- |
| **data_products** | Resource + Runtime | `get`, `get_lexicon`, `list`, `create`, `readiness`, `promote`, `get_usage_map`, `invalidate_cache`, `search`, `query`, `list_tables`, `get_queue_info`, `get_reader_checkpoint`, `stream`, `replay` |
| **schemas** | Reference | `get`, `list`, `tag_pii_fields` |
| **quality** | Resource | `list`, `get`, `create` |
| **catalog** | Reference | `search` |
| **discovery** | Reference | `search`, `get_evidence`, `get_lineage_impact`, `get_governance_flags`, `run` |
| **thesaurus** | Reference | `list_terms`, `resolve_canonical_key`, `append_synonym` |
| **domains** | Reference | `list`, `get` |
| **standards** | Reference | `list`, `get` |
| **data_contracts** | Resource | `list`, `get`, `create`, `update`, `delete` |

### Deliver

| Surface | Kind | Methods |
| --- | --- | --- |
| **targets** | Resource | `list`, `get`, `create`, `update`, `delete` |

### Advanced / platform

| Surface | Kind | Methods |
| --- | --- | --- |
| **projects** | Resource | `list`, `get`, `create`, `update`, `delete`, `apply_template`, `repository` |
| **templates** | Reference | `list`, `get` |
| **instances** | Reference | `list`, `get`, `get_stream_config` |
| **procedures** | Reference | `list` |
| **queues** | — | `get_queue_metadata`, `get_reader_checkpoint`, `open_reader`, `open_writer` |
| **observe** | — | `status` |
| **metrics** | — | `log`, `get_reporter` — no-ops (matches Node.js) |
| **process_intelligence** | — (experimental) | `get_entity_context`, `decision_traces_list` |

### `client.workflows`

| Method | Description |
| --- | --- |
| `list(project_id, *, page, page_size, status, search)` | List workflows for a project |
| `get(id)` | Get a workflow (with nodes) |
| `create(name, project_id, *, template_id, description, configuration)` | Create a workflow |
| `get_graph(workflow_id, project_id)` | Get the workflow graph definition |
| `deploy(project_id, instance_id, *, version_id, force_redeploy)` | Deploy a project to an instance |

### `client.triggers`

Ingest-side source bindings (external systems that feed a workflow).

| Method | Description |
| --- | --- |
| `list(*, page, page_size, search, type, status)` | List triggers |
| `get(id)` | Get a trigger by ID |
| `create(name, type, key, *, data, configuration, metadata)` | Create a trigger |
| `update(id, *, name, data, configuration, metadata)` | Update a trigger |
| `delete(id)` | Delete a trigger |
| `test(id)` | Test trigger connectivity |

### `client.targets`

Delivery sink bindings — how a data product delivers data to external systems
(webhooks, API endpoints, exports, database syncs, BI connections, event streams).

| Method | Description |
| --- | --- |
| `list(data_product_id, *, page, page_size, status, is_active)` | List targets for a data product |
| `get(data_product_id, target_id)` | Get a single target |
| `create(data_product_id, target_type="webhook", **kwargs)` | Create a target |
| `update(data_product_id, target_id, **kwargs)` | Update a target |
| `delete(data_product_id, target_id)` | Delete a target |

**`Target` model fields:** `consumption_id`, `data_product_id`,
`organization_id`, `target_type`, `delivery_method`, `status`, `is_active`,
`endpoint_url`, `method`, `name`, `description`, `headers`, `filters`,
`configuration`, `metadata`, `created_at`, `updated_at`.

**`target_type` values:** `webhook`, `api_endpoint`, `export`, `database_sync`,
`bi_connect`, `event_stream`.

### `client.connectors`

| Method | Description |
| --- | --- |
| `list(*, organization_id, connector_type, page, page_size, sort_by, sort_order)` | List connectors |
| `get(connector_id)` | Get a single connector |
| `create(connector_type, *, metadata)` | Create a connector |
| `update(connector_id, *, connector_type, metadata)` | Update a connector |
| `delete(connector_id)` | Delete a connector |
| `test(connector_id)` | Test connector connectivity |
| `get_oauth_url(connector_id, *, callback_url, toolkit)` | Get the OAuth authorization URL |

### `client.projects`

| Method | Description |
| --- | --- |
| `list(*, status, search, page, page_size)` | List projects |
| `get(project_id)` | Get a project by ID |
| `create(name, *, description, status, metadata, configuration, template_slug, domain_id, ...)` | Create a project |
| `update(project_id, *, name, description, status, metadata, configuration, ...)` | Update a project |
| `delete(project_id)` | Delete a project |
| `apply_template(project_id, *, template_type, template_slug, preview, placeholder_overrides)` | Apply a template |

### `client.templates`

| Method | Description |
| --- | --- |
| `list(*, category, search, page, page_size)` | List available templates |
| `get(template_id)` | Get a template by ID |

### `client.data_products`

| Method | Description |
| --- | --- |
| `get(id, *, include_schema, include_quality)` | Get a data product by ID |
| `get_lexicon(id)` | Glossary terms + field→glossary map for a data product |
| `list(*, page, page_size, domain_id, status, kind, sort_by, sort_order)` | List data products |
| `create(*, name, kind, description, domain, **kwargs)` | Create a data product (`kind` required: `'source'` or `'consumer'`) |
| `readiness(data_product_id)` | Promotion readiness (prerequisites, progress, promotable) |
| `promote(data_product_id, target_tier)` | Execute medallion tier promotion (`'silver'` / `'gold'`) |
| `get_usage_map()` | Fetch the Data Product Usage Map (source→consumer relationships) |
| `invalidate_cache(id_or_name=None)` | Clear the name→id resolution cache |
| `get_writer(id_or_name)` | Writer bound to the data product (resolves name→id) |
| `get_reader(id_or_name, *, start, batch_size)` | Iterator of events (resolves name→id) |
| `search(query, *, type, limit, offset)` | Search data products |
| `query(id, sql)` | Run SQL against a data product |
| `list_tables(id)` | List tables in a data product |
| `get_queue_info(id)` | Get queue info for a data product |
| `get_reader_checkpoint(id, bot_id)` | Get reader checkpoint for a bot |
| `stream(id, *, start, batch_size)` | Stream events (sync generator) |
| `replay(id, *, start, batch_size)` | Replay events (sync generator) |

> **Writer/reader transport:** when the client is configured with stream-bus
> config (`streams=` or `LEO_*` env) and `boto3` is installed
> (`pip install loxtep[streams]`), `data_products.get_writer` returns a **native
> Kinesis producer** and `get_reader` a **native DynamoDB/S3 consumer** — the
> performant path, matching the Node.js SDK — on both the sync and async
> clients. Without stream config both fall back to the HTTP data path. Pass
> `auto_checkpoint=True` (or call `reader.checkpoint()`) to persist read
> position to LeoCron. See the `loxtep.rstreams` module.

### `client.thesaurus`

Canonical correlation keys + aliases.

| Method | Description |
| --- | --- |
| `list_terms(org_id=None)` | List thesaurus terms for the organization |
| `resolve_canonical_key(key_or_alias, org_id=None)` | Resolve a key/alias to its canonical key (client-side match) |
| `append_synonym(canonical_key, alias_path, *, system, precedence, org_id)` | Append a synonym/alias to a canonical key |

### `client.instances`

| Method | Description |
| --- | --- |
| `list()` | List runtime instances for the organization |
| `get(instance_id)` | Get a single instance by ID |

### `client.procedures`

| Method | Description |
| --- | --- |
| `list(organization_id, *, page, page_size)` | List procedures for an organization |

### `client.observe`

| Method | Description |
| --- | --- |
| `status()` | GET /observe/bots — bot/queue observability summary |

### `client.metrics`

`metrics.log` / `metrics.get_reporter` are no-ops — matching the Node.js SDK,
where the metrics surface is also a no-op stub (it POSTs nowhere).

### `client.process_intelligence` (experimental)

Returns unified context from connected systems for a given entity. Experimental
and excluded from the core surface (parity with the Node.js SDK).

```python
context = client.process_intelligence.get_entity_context("org-id", "order", "4821")
```

## Type hints

Types are hand-written; all public methods and responses use type hints. Run
`mypy src/loxtep` for static checking.

## CLI

After `pip install loxtep` you get a `loxtep` command:

- **Native (Python):** `query`, `stream`, `replay`, `generate`, `workflows list|deploy`,
  `observe status`, `projects`, `templates`, `config export`
- **Delegated to Node** (`npx loxtep …`): `login`, `init`, `attach`, `ingest`,
  `deploy`, and any other lifecycle command — requires Node.js/npx

Config: `.loxtep/project.json` (after attach) + project-local or `~/.loxtep/credentials.json`,
or env `LOXTEP_*`. Prefer **`LoxtepClient.from_workspace()`** in app code.

See [docs/CLI.md](docs/CLI.md) and [docs/sdk-first-ingest.md](docs/sdk-first-ingest.md).

## Parity with the Node.js SDK

The **client surface matches**: same namespace names, same `snake_case` method
names, same ingest → define → deliver grouping. `flows` merged into `workflows`,
`connections`→`triggers`, `delivery`→`targets`, `data_products` writer/reader +
`get_lexicon`/`readiness`/`promote`/`invalidate_cache`, `schemas.list`/
`tag_pii_fields`, `quality.create`, `projects.repository`,
`instances.get_stream_config`, and the `thesaurus` namespace are all present.
`improvements`/`activity`/`process_intelligence` exist and are internal/
experimental (excluded from the documented surface), matching Node.

`LoxtepClient.from_workspace()` / `AsyncLoxtepClient.from_workspace()` match Node's
`fromWorkspace()`: env > explicit kwargs > `.loxtep/project.json` + credentials,
including `region` and `streams` from attach.

Remaining, intentional differences:

| Area | Node.js | Python |
| --- | --- | --- |
| `get_writer` / `get_reader` transport (sync + async) | rstreams stream bus | **native Kinesis producer + DynamoDB/S3 consumer** (`loxtep.rstreams`) when configured; HTTP fallback |
| LeoCron checkpoint persistence | yes | yes (`auto_checkpoint=` / `reader.checkpoint()`) |
| large-payload S3 write-offload (>600 KB) | auto | auto (uploads gzipped NDJSON + emits S3-pointer record) |
| S3 byte-range fast-read; snapshot/archive queues | yes | follow-ups (whole-object read is correct; live/modern queues supported) |
| `metrics` | no-op stub | no-op stub (identical) |
| Workspace lifecycle CLI | full in `@loxtep/sdk` | Python CLI delegates to Node; library owns I/O |
| Author-side modules (`skills`, `authoring`) | present | not ported (codegen/`generate` is native Python) |

`domains`, `standards`, and `data_contracts` are real HTTP-backed namespaces.
The `loxtep.rstreams` module is a native Leo data-plane client — sync **and**
async write + read, LeoCron checkpointing, and >600 KB S3 write-offload — with no
dependency on any external Leo SDK. Remaining follow-ups are perf/edge only:
S3 byte-range fast-read, and snapshot/archive queue transitions.

The low-level writer escape hatch (`workflows.get_writer`, formerly
`flows.get_writer`) exists in both and is intentionally undocumented for
customers.
