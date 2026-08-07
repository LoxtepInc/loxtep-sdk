# Project workspace status (three layers)

Stable snake_case payload for **local / cloud / deployed** visibility.

Canonical TypeScript + Zod: `src/client/project-workspace-status-types.ts`
(exported from `@loxtep/sdk`).

## Layers

| Layer | Meaning | Source of truth |
| --- | --- | --- |
| `local` | CWD / known-locals + `.loxtep/project.json` | Disk |
| `cloud` | Org project + Studio/S3 workspace | `project_id` + workspace APIs |
| `deployed` | Instance bindings after `deploy` | Deployments |

**Unpublished** = deltas between layers (not a draft flag):

- `unpublished.local_to_cloud` — Local → Cloud (not pushed / workspace out of date)
- `unpublished.cloud_to_deployed` — Cloud → Deployed (pushed but not deployed, or stale)

`dirty: null` means **not computed** at this `population_depth`. Do not treat null as clean.

## Consumers

| Surface | Uses |
| --- | --- |
| CLI `loxtep status` | Full `ProjectWorkspaceStatus` (`population_depth: "status"`) |
| CLI `loxtep status --unpublished` / `projects changes` | Same payload at `population_depth: "unpublished"` with file/entity lists |
| CLI `loxtep projects list\|get` | `ProjectListStatusEnrichment` fields |
| CLI `loxtep projects link` / `loxtep link` | Local bind + `~/.loxtep/workspaces.json` |
| MCP `get_project_workspace_status` | Full `ProjectWorkspaceStatus` (planned) |
| MCP `list_projects` / `get_project` | Enrich with summary fields when cheap (planned) |

Producer helpers live in `src/client/project-workspace-status.ts`
(`buildProjectWorkspaceStatus`, `formatProjectWorkspaceStatusLines`,
`enrichProjectListSummary`) and `src/client/project-workspace-inventory.ts`
(push discovery + `.loxtep/push-manifest.json` compare).

Do **not** invent a second list command; enrich the existing `projects` plural group.

Distinct from CLI/MCP **`observe status`** (runtime bots/queues).

## Link vs attach (Phase C)

| Command | Binds | Writes |
| --- | --- | --- |
| `loxtep projects link` / `loxtep link` | Cloud **project** ↔ local directory | `.loxtep/project.json` (`project_id`) + `~/.loxtep/workspaces.json` |
| `loxtep attach` | Local project ↔ runtime **Instance** | `instance_id` + `api_url` (+ streams) in `.loxtep/project.json` |
| `loxtep init --project-id` | Same project bind as `link`, plus scaffold dirs | project.json + known-locals upsert |

Canonical flow for an existing unbound cloud project:

```text
loxtep projects link <project_id|name> [--path .]
loxtep attach --instance <instance-id>
# edit local package
loxtep push
loxtep deploy
```

GitHub is optional for `link` (`cloud.github.state` may remain `unbound`).

## Population cost (keep list snappy)

Field costs live in `PROJECT_WORKSPACE_STATUS_FIELD_COST`. Depth ceilings:

| `population_depth` | Cost ceiling | Typical use |
| --- | --- | --- |
| `summary` | `cheap` | Every list row: local path presence, github linked\|unbound, attach |
| `status` | `moderate` | `loxtep status` / MCP get: last deploy id/status/age, dirty **booleans** |
| `unpublished` | `expensive` | `--unpublished` / `list_project_changes`: entity/file inventories + counts |

**Cheap (list-safe):** cwd / known-locals FS checks; columns already on the cloud
project list row (`project_id`, `name`, `github_repo_*`).

**Moderate (status/get):** one deploy lookup (or cached join) per project;
Local→Cloud dirty boolean via package vs `.loxtep/push-manifest.json`
(same discovery as `loxtep push`) without attaching per-file lists.

**Expensive (opt-in):** `loxtep status --unpublished` / `loxtep projects changes` —
walk local package vs push manifest (+ optional cloud workflow id escalate),
attach `unpublished.*.changes` entity/file inventory and counts.

Producers SHOULD omit or set `null` rather than stall list enrichment on moderate/expensive work.

## GitHub linked vs unbound

`cloud.github.state`:

- `linked` — project has GitHub binding (`github_repo_url` / name)
- `unbound` — no GitHub; Studio/S3 + `loxtep push` path

Attach (`local.attach_state`) is **instance** binding (`loxtep attach`), not GitHub.

## Deploy age / status

`deployed.state`: `never_deployed` | `deployed` | `stale` | `unknown`.

When known: `deployment_id`, `deployment_status`, `last_deployed_at`,
`age_seconds` (derived). Prefer `unknown` over inventing success when the deploy
API is unavailable.

## Example (status depth)

```json
{
  "schema_version": 1,
  "population_depth": "status",
  "project_id": "11111111-1111-1111-1111-111111111111",
  "display_name": "shopify-ingest",
  "local": {
    "presence": "present",
    "path": "/home/you/proj",
    "project_file": "/home/you/proj/.loxtep/project.json",
    "known_local": true,
    "attach_state": "attached",
    "instance_id": "22222222-2222-2222-2222-222222222222",
    "api_url": "https://apidev.loxtep.io",
    "project_id": "11111111-1111-1111-1111-111111111111"
  },
  "cloud": {
    "presence": "present",
    "project_id": "11111111-1111-1111-1111-111111111111",
    "organization_id": "33333333-3333-3333-3333-333333333333",
    "name": "shopify-ingest",
    "status": "active",
    "github": {
      "state": "unbound",
      "url": null,
      "name": null,
      "branch": null,
      "last_sync_at": null
    },
    "workspace_revision": null,
    "workspace_updated_at": null
  },
  "deployed": {
    "presence": "absent",
    "state": "never_deployed",
    "instance_id": "22222222-2222-2222-2222-222222222222",
    "deployment_id": null,
    "deployment_status": null,
    "last_deployed_at": null,
    "age_seconds": null
  },
  "unpublished": {
    "local_to_cloud": {
      "dirty": true,
      "summary": "Local package has changes not pushed",
      "changed_count": null
    },
    "cloud_to_deployed": {
      "dirty": false,
      "summary": "Never deployed",
      "changed_count": null
    }
  },
  "next_action": "push",
  "notes": []
}
```
