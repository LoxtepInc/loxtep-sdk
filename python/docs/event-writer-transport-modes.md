# Event writer transport modes

`client.get_writer()` uses the durable `default` mode unless another mode is
selected:

| Mode      | Behavior                                          |
| --------- | ------------------------------------------------- |
| `default` | Durable, balanced, and recommended                |
| `fast`    | Lowest latency; direct publishing may cost more   |
| `volume`  | High throughput; batching introduces delivery lag |

```python
writer = client.get_writer("orders", transport_mode="default")
writer.write({"id": "123"})
writer.close()
```

Sync and async data-product writers and low-level workflow writers accept the
same `transport_mode` values. Omitting the option selects `default`.

Durable writes still publish a small queue notification after storing an event
batch. A notification timeout can therefore occur in `default` mode; the
selected mode alone does not prove the cause of a transport error.
