# MCP tools vs SDK (high level)

This is a **guide for agents**, not an exhaustive OpenAPI listing. MCP stays on
**HTTP**; the SDK adds **typed REST** and the **stream data plane** for live
I/O.

| Area                     | MCP (typical)                             | SDK                                                                      |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| Catalog / discovery      | `POST /ai/mcp/tools/call` discovery tools | `client.discovery.*`, `client.catalog.search`                            |
| Data products            | MCP dataproduct tools                     | `client.data_products` (get, list, create, query, stream, replay, …)     |
| Workflows                | MCP / Studio workflows                    | `client.workflows`, `client.projects`                                    |
| Triggers / connectors    | MCP connectors                            | `client.triggers`, `client.connectors`                                   |
| Org / instances          | MCP org / instances                       | `client.instances.list()`, config `instance_id`                          |
| Live queue I/O           | Not a substitute for the stream runtime   | `client.queues`, `data_products.get_writer`                              |

When unsure: **MCP for provisioning and agent tool calls**; **SDK for runtime**
services running in your infrastructure or CI.
