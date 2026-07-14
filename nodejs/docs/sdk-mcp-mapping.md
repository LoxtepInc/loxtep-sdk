# MCP tools vs SDK (high level)

This is a **guide for agents**, not an exhaustive OpenAPI listing. MCP stays on
**HTTP**; the SDK adds **typed REST** and the **stream data plane** for live
I/O.

| Area                     | MCP facade (tool)                          | SDK                                                                      |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------ |
| Catalog / discovery      | `loxtep_catalog` (search_catalog, get_evidence, …) | `client.discovery.*`, `client.catalog.search`                    |
| Data products            | `loxtep_data_products`                     | `client.data_products` (get, list, create, query, stream, replay, …)     |
| Workflows                | `loxtep_workflows`                         | `client.workflows`, `client.projects`                                    |
| Triggers                 | `loxtep_triggers` (was `loxtep_connections`) | `client.triggers`                                                      |
| Connectors               | `loxtep_connectors`                        | `client.connectors`                                                      |
| Targets (delivery)       | `loxtep_data_products` (create_target / list_targets) | `client.targets`                                              |
| Org / instances          | `loxtep_instances`                         | `client.instances`, config `instance_id`                                 |
| Live queue I/O           | Not a substitute for the stream runtime    | `client.queues`, `data_products.get_writer`/`get_reader`                 |

Vocabulary matches the SDK: MCP uses `loxtep_triggers` (backend: connections) and
target operations (backend: consumptions). The prior names — `loxtep_connections`,
`create_delivery_interface`/`create_consumption` — remain as **deprecated aliases**,
so older agent configs keep working.

When unsure: **MCP for provisioning and agent tool calls**; **SDK for runtime**
services running in your infrastructure or CI.
