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
  init [--template <slug>] [--project-id <uuid>] [--create-repo | --from-repo <url>]
                     Scaffold workspace; requires login to register (or bind) a platform project
  link <project_id|name> [--path <dir>]
                     Bind a cloud project to a local directory (writes .loxtep/project.json;
                     upserts ~/.loxtep/workspaces.json). Alias: projects link. Not attach.
  attach [--instance <id>]
                     Bind workspace to a runtime Instance (writes instance_id + api_url)
  status [--json]    Cwd-first project workspace status (local / cloud / deployed)
                     Distinct from observe status (runtime bots/queues)
  generate           Emit typed workspace artifact (.loxtep/generated/index.ts)
  projects list [--source local|remote|all] | get <id> | link <id|name> [--path <dir>]
                     | clone <id|name> [dir] | pull | push
                     List/get/link/clone org projects. clone = Cloud→Local (git when
                     GitHub-bound; workspace export when unbound). projects pull/push wrap
                     GitHub sync APIs (bound only). Unbound Local→Cloud stays "loxtep push".
  instances list | get <id> | create … | deployment-urls | register … | registration
                     Provision and register runtime instances

Build & deploy
  connectors list [--type sdk]
                     List org connectors (reuse SDK connector before create)
  connectors test <connector_id>
                     Connectivity probe (POST /connectors/{id}/test). Not samples.
  connectors capture-samples <connector_id> --entity-type <name> [--limit N]
                     Fetch bounded entity samples. Limit 1–25.
  ingest create [--name app-events] [--domain-id <id>] [--connector-id <id>]
                     [--iceberg] [--dry-run] [--deploy]
                     Trigger + source DP local package (alias: ingest provision)
  transform create --from <dp> [--name cleaned-…] [--dry-run]
                     Enrichment workflow stub (upstream DP → consumer DP)
  delivery create --from <dp> --connector-id <id> [--name …] [--dry-run]
                     Delivery workflow (DP → target connection); workflow_type: delivery
  lint [--workflow <id>]
                     Validate local entity JSON (schemas + relationships)
  push [--workflow-id <id>] [--dry-run] [--skip-reindex]
                     Upload local workflows via save_workflow_bundle + reindex
  bundle save [--file .loxtep/sdk-ingest-bundle.json] [--dry-run]
                     Persist a workflow entity bundle JSON to the project workspace
  test <module> --event <file>
                     Run a workflow module locally (action trace)
  deploy [--dry-run] Compile workflow modules and deploy (lint preflight first)
  workflows list | get <id> | create … | deploy …
                     List/create/deploy workflows (--project-id; create also --workflow-type, --domain-id)
  triggers list | get <id> | create … | test <id>
                     Ingest trigger bindings (project entities; --project-id required)
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
  pnpm exec loxtep projects link <project_id>   # or: loxtep link <name>
  pnpm exec loxtep attach --instance <id>
  pnpm exec loxtep init && pnpm exec loxtep attach --instance <id>
  pnpm exec loxtep connectors list --type sdk
  pnpm exec loxtep connectors test <connector_id>
  pnpm exec loxtep connectors capture-samples <connector_id> --entity-type products --limit 10
  pnpm exec loxtep ingest create --name app-events
  pnpm exec loxtep transform create --from app-events --name cleaned-events
  pnpm exec loxtep delivery create --from cleaned-events --connector-id <id>
  pnpm exec loxtep lint
  pnpm exec loxtep push
  pnpm exec loxtep deploy --dry-run
  pnpm exec loxtep init --template shopify-orders
  pnpm exec loxtep attach --instance prod && pnpm exec loxtep generate
  pnpm exec loxtep status
  pnpm exec loxtep projects list
  pnpm exec loxtep projects list --source local
  pnpm exec loxtep workflows list
  pnpm exec loxtep test orders-enricher --event ./events/order.json
  pnpm exec loxtep deploy
  pnpm exec loxtep data-products list
  pnpm exec loxtep data-products query <id> "SELECT * FROM t LIMIT 10"
  pnpm exec loxtep queue info <data-product-id>
  pnpm exec loxtep observe status
  pnpm exec loxtep config export --from-connector <connector-id> --format json

Docs: nodejs/docs/sdk-first-ingest.md · nodejs/docs/code-first-cli.md · nodejs/docs/getting-started.md · nodejs/docs/quick-reference.md · nodejs/docs/project-workspace-status.md

Update checks: newer npm versions are announced on stderr (cached daily under ~/.loxtep).
Disable with LOXTEP_NO_UPDATE_NOTIFIER=1 (or NO_UPDATE_NOTIFIER / CI).
`.trimEnd();

export function printCliHelp(): void {
  console.log(CLI_HELP);
}
