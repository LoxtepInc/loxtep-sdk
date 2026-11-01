# Event writer transport modes

Node and Python event writers use `default` unless you explicitly select a
different mode.

| Mode      | Best for                         | Tradeoff                                    |
| --------- | -------------------------------- | ------------------------------------------- |
| `default` | Most application and pipeline IO | Durable, balanced, and recommended          |
| `fast`    | Lowest publish latency           | Direct publishing may cost more             |
| `volume`  | Sustained high throughput        | Throughput batching introduces delivery lag |

## Node

```ts
const writer = await client.get_writer("orders", {
  transport_mode: "default",
});
```

The top-level data-product writer, low-level workflow writer, and queue writer
all accept the same values.

## Python

```python
writer = client.get_writer("orders", transport_mode="default")
```

Sync and async data-product and low-level workflow writers accept the same
values.

## CLI and MCP

```bash
loxtep ingest create --name orders --transport-mode default
loxtep transform create --from orders --transport-mode fast
loxtep delivery create --from orders --connector-id <id> --transport-mode volume
```

The CLI writes the setting to
`runtime_settings.event_writer.transport_mode` in the generated entity JSON.
MCP uses the same field in `save_workflow_bundle`; retrieve the current contract
with `get_entity_schemas`.

Durable writes still publish a small queue notification after storing the event
batch. A notification transport timeout can therefore affect `default` mode;
the mode alone does not establish the cause of a transport error.
