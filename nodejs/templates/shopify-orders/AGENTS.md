# AGENTS.md — shopify-orders

This project was scaffolded from the `shopify-orders` template (Try it sample).

## MCP tools

```json
{ "mcpServers": { "loxtep": { "url": "https://mcp.loxtep.io/ai/mcp/stream" } } }
```

Dev MCP host: `https://mcpdev.loxtep.io/ai/mcp/stream`.

## Lifecycle

```bash
loxtep login
loxtep attach --instance <non-prod-instance-id>
loxtep setup
loxtep generate
loxtep test orders-enricher --event ./events/order-created.json
loxtep deploy
```

`loxtep test` runs the handler locally with **live** instance I/O. Approve
`dataProducts.write` when prompted.

## SDK methods

- `LoxtepClient.fromWorkspace()` — configure from `.loxtep/project.json`
- `defineDataWorkflow({ name, triggers, handler, requireApproval })`
- `workspace.dataProducts.*` — typed constants after `loxtep generate`

## Skill scope

Default skill: `.loxtep/skills/shopify-orders.yaml`
