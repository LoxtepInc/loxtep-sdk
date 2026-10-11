# Data plane CLI

Commands added in `@loxtep/sdk` 0.9.25. They call the existing Loxtep REST API
through the workspace client. Organization, project, and instance come from
`loxtep attach` and `~/.loxtep`. `--instance <uuid>` overrides
`x-loxtep-instance-id` for that command.

Source in this checkout is 0.9.25. The published npm package and the deployed
data-products service are separate. A queued rebuild is acceptance of a job,
not a finished table.

Stage targets used while checking these commands:

| Name | Id |
| --- | --- |
| EventLog | `fc5773cd-889c-57ba-ac0f-1d6ec96fc684` |
| EventDataLog | `b1b6b3ab-43d8-580a-a1ec-9e2113e19016` |
| Instance | `a9da8b2d-5ef0-44ba-80c9-9039f5b9a8f0` |
| Project | `ee84d9f6-97da-45d2-a07a-fb0d31ac9f4a` |

Production is outside this work. Do not reset MongoDB capture identities,
retained queues, checkpoints, or namespace exclusions.

## Iceberg rebuild

```bash
loxtep data-products iceberg rebuild <product-id> \
  --backfill-from <z/eid|checkpoint|start_of_queue> \
  [--start-checkpoint <z/eid>] \
  [--end-checkpoint <z/eid>] \
  [--dry-run] [--confirm] [--wait 30s] [--interval 5s] [--json]
```

Scope is required. The CLI rejects a missing `--backfill-from`, and it rejects
`start`, `all`, `now`, and the enable windows `1h`, `6h`, `1d`, `7d`, `30d`.
`checkpoint` needs `--start-checkpoint` beginning with `z/`. `start_of_queue` is
sent only when that token is typed. Omitting `--end-checkpoint` is evergreen
and the receipt says `end_bound: evergreen`.

`--confirm` is required for a real rebuild. `--dry-run` does not require it.
The HTTP body still sends `confirm: true` because the API schema requires that
literal. The receipt says `confirm_sent_for_api_gate: true` and
`destructive: false` for a dry run.

A dry run in the data-products service skips schema-stamp persistence, the
partition write, and `POST /api/iceberg/config`. It still asks the instance
worker to plan. The response includes `pending_mutations` for the writes a real
rebuild would make. That read-only control plane is in source. It is live only
after the data-products service that contains it is deployed.

Exit 0 means the dry run was accepted, or a real rebuild was accepted with
`completed: false`. Exit 1 is validation, HTTP failure, `already_running`, or
`endpoint_missing`. `--wait` polls `GET .../iceberg/health` for the same
`job_id` (or `backfill_job_id` on that overlay). Exit 0 from `--wait` means that
job reached `completed`. Exit 2 is a timeout: the JSON still has `job_id` and
the last status, and the command does not POST again and does not cancel.
A different current job is `job_not_current` (exit 1). A completed status with
no matching job id is not treated as success.

```bash
loxtep data-products iceberg rebuild b1b6b3ab-43d8-580a-a1ec-9e2113e19016 \
  --backfill-from z/2026/10/10/00/00/1 \
  --dry-run --json

loxtep data-products iceberg status b1b6b3ab-43d8-580a-a1ec-9e2113e19016 \
  --job-id <accepted-job-id> --wait 30s --json

loxtep data-products iceberg cancel b1b6b3ab-43d8-580a-a1ec-9e2113e19016 --json
```

Cancel calls `POST .../iceberg/rebuild/cancel`. When the instance has no cancel
route, the error code stays `endpoint_missing`. That is not a cancelled job.

## Enable, config, and inspection

```bash
loxtep data-products iceberg enable <product-id> \
  --config '<json>' | --file <path> \
  [--backfill-from now|1h|6h|1d|7d|30d|all]

loxtep data-products iceberg config <product-id>
loxtep data-products iceberg config <product-id> --put --file <path>
loxtep data-products iceberg health <product-id>
loxtep data-products iceberg files <product-id>
loxtep data-products iceberg snapshots <product-id>
loxtep data-products iceberg schema <product-id> --json
```

Enable history windows are only `now`, `1h`, `6h`, `1d`, `7d`, `30d`, and `all`.
Omitting the window sends no history. A `z/` event id is not accepted on enable.
The command does not invent a partition; `--config` or `--file` supplies
`iceberg_config`.

There is no `GET /iceberg/config`. `config` without `--put` reads
`GET /dataproducts/{id}/iceberg` and prints `iceberg_config`. `--put` writes
`PUT /dataproducts/{id}/iceberg/config`.

`schema` prints four blocks:

- `catalog` — the product schema, including fields such as `event_type`.
- `physical` — Iceberg metadata fields, partition, file and snapshot counts, plus the configured partition from status.
- `materialization` — assessment status, rebuild and backfill status, writer sync.
- `inspection` — `ok` when metadata was read (including `schema_mismatch`), `empty_ok`, `unknown` for `unknown` and `managed_s3_tables`, `unreadable`, or `not_applicable`.

`schema_mismatch` stays a materialization status. The catalog field is not removed.

## SQL receipt

```bash
loxtep data-products query <product-id> "SELECT event_type FROM t LIMIT 10" --receipt
loxtep data-products query <product-id> --file ./query.sql --json
```

`data_products.query` still returns rows, and only when the native status is
`completed`. Any other status, including a missing status, throws
`WarehouseQueryError` and does not rewrite the status to completed. The error
includes `query_id` when the body has one.

`--receipt` and `--json` print `query_id`, `status`, columns, rows, `row_count`,
`execution_time_ms`, `error`, `error_code`, `tables_referenced`, `recovery`,
`iceberg_health_status`, and `completion_evidence` (`native` or `missing`).
Failed and unfinished queries exit 1. Warehouse execute is synchronous. There
is no second poll URL.

SDK:

```typescript
const receipt = await client.build.data_products.query_receipt(productId, sql);
const rows = await client.build.data_products.query(productId, sql);
```

Python `DataProductsApi.query` still returns rows only. The Python CLI delegates
unknown commands to the Node CLI.

## Read-only export

```bash
loxtep data-products export <product-id> \
  --start <eid> | --from-beginning \
  [--end <eid>] [--limit 100] [--max-pages 1] \
  [--instance <uuid>] [--json]
```

This pages `GET /observe/trace/{queue}/events`. It does not open a reader, commit
a checkpoint, or trigger a workflow. The result says `read_only: true` and
`checkpoint_committed: false`. The trace API has no limit or cursor of its own,
so the client slices the page. `truncated` is true when the page is longer than
`--limit` or `--max-pages` stops the loop. `next_start` may repeat the last
included event id because trace start is inclusive. If the server sends `next`
or `next_start`, that cursor is preferred.

`--from-beginning` sends `start=0`. With neither `--start` nor
`--from-beginning`, the command exits 1 and does not fetch. Export and queue
reads require an instance id. A queue name missing from that instance's list is
`not_visible`. An empty list for that instance is `empty_on_selected_instance`.
Neither result is an empty checkpoint.

`data_products.replay()` remains the path that delivers events to a destination.
Iceberg rebuild is the history-delivery path. Export is not replay.

## Governance

```bash
loxtep data-contracts update <contract-id> --schema-version-id <uuid> --json
loxtep quality-rules list [--data-product-id <uuid>] [--rule-type <type>] [--severity <level>]
loxtep quality-rules get <id> [--data-product-id <uuid>]
loxtep quality-rules create --file <json>
loxtep quality-rules update <id> --file <json>
loxtep quality-rules delete <id>
loxtep define glossary <product-id>
loxtep define apply-glossary <product-id> [--mapping-revision N]
loxtep data-products primary-entity <product-id>
```

Contract update is `PUT /dataproducts/datacontracts/{id}` with
`schema_version_id`. Quality rules use `/dataproducts/quality-rules`. There is
no GET-by-id route, so `get` scans the list and returns `not_in_list` when the
id is absent. Create allows `uniqueness`. The list filter enum on the service
may omit it.

Glossary apply posts `/semantic-layer/glossary/bindings` with
`{ data_product_id, mapping_revision? }`. `define glossary` reads the product
lexicon. Primary entity is read from `schema.entities`. Changing it goes through
`define submit-shape`, then approve and apply. The command does not write a key.
A source trigger or delivery id is not treated as a unique lookup key.

## Release and deploy

1. Data-products dry-run and warehouse schema-mismatch behavior ship with the
   platform service. Until that service is deployed, a CLI dry run can still hit
   the previous handler.
2. Publish Node `@loxtep/sdk` 0.9.25 with tag `v0.9.25`. Python stays 0.7.2
   unless `data_products.py` changes. Do not use a bare `v*` tag for a Python-only
   release.
3. After npm publish, install the global CLI and run `hash -r`. Confirm
   `loxtep --version` and `loxtep data-products iceberg --help` (or `loxtep --help`)
   show 0.9.25 and the new commands. A pnpm global shim can keep pointing at an
   older copy after install.
4. Stage checks of EventLog and EventDataLog come after the package is installed
   and the data-products deploy is confirmed. Cancel may still return
   `endpoint_missing` until the instance cancel route exists.
