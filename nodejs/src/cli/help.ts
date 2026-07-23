/**
 * Top-level CLI help — customer-facing command groups (no internal MCP facade names).
 */

export const CLI_HELP = `
Loxtep — the Enterprise Context Layer.
Turns organizational knowledge, expertise, and norms into machine-usable context for AI.

Usage: loxtep <command> [subcommand] [options]
       loxtep --version | loxtep -V

Authentication
  login              Log in (browser by default; --console for email/password/TOTP)
                     Saves to ./.loxtep/credentials.json by default (--global for ~/.loxtep)
  logout             Remove stored credentials (--local / --global to force scope)
  whoami             Print current user and organization

Workspace
  init [--template <slug>] [--create-repo | --from-repo <url>]
                     Scaffold .loxtep/project.json + domains/, connectors/, workflows/, data-products/
  attach [--instance <id>]
                     Link project to a runtime instance (writes instance_id + api_url)
  generate           Emit typed workspace artifact (.loxtep/generated/index.ts)
  instances list | get <id> | create … | deployment-urls | register … | registration
                     Provision and register runtime instances

Build & deploy
  test <module> --event <file>
                     Run a workflow module locally (action trace)
  deploy             Compile workflow modules and deploy to the attached instance
  workflows list | get <id> | create … | deploy …
                     List, inspect, create, and deploy workflows (--project-id or config)
  triggers list | get <id> | create … | test <id>
                     Ingest trigger bindings
  data-products list | get <id> | create … | readiness <id> | promote <id> --target …
                     Data product CRUD and medallion promotion

Governance
  domains list | get <id>
  standards list | get <id>              Standards (policies)
  data-contracts list | get <id> | create …

Review
  improvements list [--status …] [--workflow <name>]
  improvements apply <id> | reject <id>  Adopt or reject AI-eval workflow improvements

Analytics
  data-products query <id> "SQL" | --file <path>
  data-products tables <id>              List tables for analytics SQL

Observe
  observe status                         Platform / instance health snapshot
  queue info <data-product-id> | --queue <name>
  queue checkpoint <id> --bot <bot-id>   Reader checkpoint for a bot
  metrics rate-limits | log --id <id> --value <n>

Activity
  activity list [--source …] [--actor …] [--resource-type …] [--from …] [--to …]

Configuration
  config list | paths | set <key> <value>
  config export --from-connector <id> | --from-data-product <id> [--format sh|json|env]
  bus login                              Stream bus vs JWT explainer (placeholder)

Examples:
  pnpm exec loxtep login
  pnpm exec loxtep init --template shopify-orders
  pnpm exec loxtep attach --instance prod && pnpm exec loxtep generate
  pnpm exec loxtep test orders-enricher --event ./events/order.json
  pnpm exec loxtep deploy
  pnpm exec loxtep data-products list
  pnpm exec loxtep workflows list --project-id <project-id>
  pnpm exec loxtep data-products query <id> "SELECT * FROM t LIMIT 10"
  pnpm exec loxtep queue info <data-product-id>
  pnpm exec loxtep observe status
  pnpm exec loxtep config export --from-connector <connector-id> --format json

Docs: nodejs/docs/code-first-cli.md · nodejs/docs/getting-started.md · nodejs/docs/quick-reference.md
`.trimEnd();

export function printCliHelp(): void {
  console.log(CLI_HELP);
}
