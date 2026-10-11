/**
 * CLI for Iceberg control, read-only export, query receipts, and governance gaps.
 * Commands call the existing REST API. A queued rebuild is not completion.
 */

import { readFile } from 'fs/promises';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import { requireCliClient, type CreateCliClientOptions } from '../create-cli-client.js';

const ENABLE_WINDOWS = new Set(['now', '1h', '6h', '1d', '7d', '30d', 'all']);
const REJECTED_REBUILD_SCOPES = new Set(['start', 'all', 'now', '1h', '6h', '1d', '7d', '30d']);

export interface CliIo {
  log: (line: string) => void;
  error: (line: string) => void;
}

const defaultIo: CliIo = {
  log: line => console.log(line),
  error: line => console.error(line),
};

function emit(io: CliIo, json: boolean, value: unknown): void {
  io.log(json ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}

function fail(
  io: CliIo,
  json: boolean,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
  exitCode = 1
): number {
  const payload = { code, message, ...extra };
  const job = typeof extra.job_id === 'string' ? ` job_id=${extra.job_id}` : '';
  io.error(json ? JSON.stringify(payload) : `${code}: ${message}${job}`);
  return exitCode;
}

export function argValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function parseDurationMs(value: string): number | undefined {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value.trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const unit = match[2];
  if (unit === 'ms') return amount;
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60_000;
  return amount * 3_600_000;
}

function isQueueEid(value: string): boolean {
  return value.startsWith('z/');
}

export interface RebuildRequestBody {
  confirm: true;
  backfill_from: string;
  start_checkpoint?: string;
  end_checkpoint?: string;
  dry_run: boolean;
}

export function validateRebuildArgs(
  args: string[]
): { ok: true; body: RebuildRequestBody; end_bound: 'evergreen' | 'checkpoint' } | { ok: false; code: string; message: string } {
  const mode = argValue(args, '--backfill-from');
  if (!mode) {
    return {
      ok: false,
      code: 'scope_required',
      message:
        'Rebuild requires --backfill-from <z/eid>, --backfill-from checkpoint --start-checkpoint <z/eid>, or --backfill-from start_of_queue',
    };
  }
  if (REJECTED_REBUILD_SCOPES.has(mode)) {
    return {
      ok: false,
      code: 'unsupported_scope',
      message: `Rebuild does not accept backfill_from ${mode}. Pass a z/ event id, checkpoint, or start_of_queue.`,
    };
  }
  const dryRun = hasFlag(args, '--dry-run');
  if (!dryRun && !hasFlag(args, '--confirm')) {
    return {
      ok: false,
      code: 'confirm_required',
      message: 'A rebuild deletes and recreates the table. Pass --confirm. --dry-run does not require it.',
    };
  }
  const end = argValue(args, '--end-checkpoint');
  if (end && !isQueueEid(end)) {
    return { ok: false, code: 'invalid_end_checkpoint', message: '--end-checkpoint must be a z/ event id' };
  }
  const body: RebuildRequestBody = { confirm: true, backfill_from: mode, dry_run: dryRun };
  if (mode === 'checkpoint') {
    const start = argValue(args, '--start-checkpoint');
    if (!start || !isQueueEid(start)) {
      return {
        ok: false,
        code: 'start_checkpoint_required',
        message: '--backfill-from checkpoint requires --start-checkpoint <z/eid>',
      };
    }
    body.start_checkpoint = start;
  } else if (mode === 'start_of_queue') {
    body.backfill_from = 'start_of_queue';
  } else if (isQueueEid(mode)) {
    body.backfill_from = mode;
  } else {
    return {
      ok: false,
      code: 'unsupported_scope',
      message: `Unsupported --backfill-from ${mode}`,
    };
  }
  if (end) body.end_checkpoint = end;
  return { ok: true, body, end_bound: end ? 'checkpoint' : 'evergreen' };
}

function errorFields(err: unknown): { message: string; code?: string; job_id?: string } {
  const record = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const details =
    record.details && typeof record.details === 'object'
      ? (record.details as Record<string, unknown>)
      : {};
  const code =
    typeof details.code === 'string'
      ? details.code
      : typeof record.code === 'string'
        ? record.code
        : undefined;
  const jobId =
    typeof details.job_id === 'string'
      ? details.job_id
      : typeof record.job_id === 'string'
        ? record.job_id
        : undefined;
  return {
    message: err instanceof Error ? err.message : String(err),
    code,
    job_id: jobId,
  };
}

function applyInstance(client: LoxtepClient, args: string[], io: CliIo, json: boolean): number | undefined {
  const instance = argValue(args, '--instance');
  if (instance) client.setInstanceId(instance);
  return undefined;
}

function requireInstance(client: LoxtepClient, io: CliIo, json: boolean): number | undefined {
  if (client.instance_id) return undefined;
  return fail(
    io,
    json,
    'instance_required',
    'Select an instance with --instance or attach a project that has instance_id'
  );
}

function trackedRebuildJobIds(health: Record<string, unknown>): {
  status?: string;
  ids: string[];
  current?: string;
} {
  const rebuild =
    health.rebuild_status && typeof health.rebuild_status === 'object'
      ? (health.rebuild_status as Record<string, unknown>)
      : undefined;
  const ids = [rebuild?.job_id, rebuild?.backfill_job_id].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  return {
    status: typeof rebuild?.status === 'string' ? rebuild.status : undefined,
    ids,
    current: ids[0],
  };
}

export async function pollIcebergJob(input: {
  readHealth: () => Promise<Record<string, unknown>>;
  jobId: string;
  waitMs: number;
  intervalMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<{ exitCode: number; body: Record<string, unknown> }> {
  const sleep = input.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = input.now ?? (() => Date.now());
  const started = now();
  let lastStatus: string | undefined;
  let lastHealth: Record<string, unknown> = {};
  while (true) {
    lastHealth = await input.readHealth();
    const tracked = trackedRebuildJobIds(lastHealth);
    lastStatus = tracked.status;
    const matches = tracked.ids.includes(input.jobId);
    if (tracked.ids.length > 0 && !matches) {
      return {
        exitCode: 1,
        body: {
          code: 'job_not_current',
          message: 'Health is tracking a different rebuild job',
          job_id: input.jobId,
          current_job_id: tracked.current,
          status: lastStatus,
          completed: false,
        },
      };
    }
    if (matches && lastStatus === 'completed') {
      return {
        exitCode: 0,
        body: { job_id: input.jobId, status: 'completed', completed: true, health: lastHealth },
      };
    }
    if (matches && lastStatus === 'failed') {
      return {
        exitCode: 1,
        body: {
          code: 'rebuild_failed',
          message: 'Rebuild job failed',
          job_id: input.jobId,
          status: 'failed',
          completed: false,
          health: lastHealth,
        },
      };
    }
    if (now() - started >= input.waitMs) {
      return {
        exitCode: 2,
        body: {
          code: 'wait_timeout',
          message: 'Timed out waiting for the original rebuild job. It was not resubmitted or cancelled.',
          job_id: input.jobId,
          status: lastStatus ?? 'unknown',
          completed: false,
          health: lastHealth,
        },
      };
    }
    await sleep(input.intervalMs);
  }
}

function inspectionOf(health: Record<string, unknown>): string {
  if (health.not_applicable === true) return 'not_applicable';
  const assessment =
    health.assessment && typeof health.assessment === 'object'
      ? (health.assessment as Record<string, unknown>)
      : undefined;
  const status = typeof assessment?.status === 'string' ? assessment.status : undefined;
  if (!assessment) return 'unreadable';
  if (status === 'empty_ok') return 'empty_ok';
  if (status === 'unknown' || status === 'managed_s3_tables') return 'unknown';
  if (status === 'unreadable') return 'unreadable';
  return 'ok';
}

export interface IcebergClock {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export async function executeIceberg(
  client: LoxtepClient,
  args: string[],
  io: CliIo,
  clock?: IcebergClock
): Promise<number> {
  const json = hasFlag(args, '--json');
  const action = args[0];
  const productId = args[1];
  applyInstance(client, args, io, json);
  if (!action || !productId || productId.startsWith('--')) {
    return fail(
      io,
      json,
      'usage',
      'loxtep data-products iceberg rebuild|status|cancel|enable|config|health|files|snapshots|schema <product-id>'
    );
  }

  try {
    if (action === 'rebuild') {
      const validated = validateRebuildArgs(args);
      if (!validated.ok) return fail(io, json, validated.code, validated.message);
      const accepted = await client.build.data_products.iceberg.rebuild(productId, validated.body);
      const jobId = typeof accepted.job_id === 'string' ? accepted.job_id : undefined;
      const receipt: Record<string, unknown> = {
        ...accepted,
        job_id: jobId,
        data_product_id: accepted.data_product_id ?? productId,
        accepted_status: accepted.status ?? null,
        status: validated.body.dry_run ? 'dry_run' : accepted.status ?? 'queued',
        completed: false,
        backfill_from: validated.body.backfill_from,
        start_checkpoint: validated.body.start_checkpoint,
        end_checkpoint: validated.body.end_checkpoint ?? null,
        end_bound: validated.end_bound,
        dry_run: validated.body.dry_run,
        confirm_sent_for_api_gate: true,
        destructive: validated.body.dry_run ? false : true,
      };
      const waitArg = argValue(args, '--wait');
      if (!waitArg) {
        emit(io, json, receipt);
        return 0;
      }
      if (!jobId) {
        emit(io, json, receipt);
        return fail(io, json, 'job_id_missing', 'Rebuild was accepted without a job id, so --wait cannot poll');
      }
      const waitMs = parseDurationMs(waitArg);
      if (waitMs == null) {
        return fail(io, json, 'invalid_wait', '--wait expects a duration such as 30s', { job_id: jobId });
      }
      const intervalArg = argValue(args, '--interval') ?? '5s';
      const intervalMs = parseDurationMs(intervalArg);
      if (intervalMs == null) {
        return fail(io, json, 'invalid_interval', '--interval expects a duration such as 5s', {
          job_id: jobId,
        });
      }
      const polled = await pollIcebergJob({
        jobId,
        waitMs,
        intervalMs,
        now: clock?.now,
        sleep: clock?.sleep,
        readHealth: async () => client.build.data_products.iceberg.health(productId),
      });
      emit(io, json, { ...receipt, ...polled.body, requested: receipt });
      return polled.exitCode;
    }

    if (action === 'status') {
      const health = await client.build.data_products.iceberg.health(productId);
      const requested = argValue(args, '--job-id');
      const waitArg = argValue(args, '--wait');
      if (waitArg) {
        if (!requested) return fail(io, json, 'job_id_required', 'status --wait requires --job-id');
        const waitMs = parseDurationMs(waitArg);
        const intervalMs = parseDurationMs(argValue(args, '--interval') ?? '5s');
        if (waitMs == null || intervalMs == null) {
          return fail(io, json, 'invalid_wait', '--wait and --interval expect durations such as 30s');
        }
        const polled = await pollIcebergJob({
          jobId: requested,
          waitMs,
          intervalMs,
          now: clock?.now,
          sleep: clock?.sleep,
          readHealth: async () => client.build.data_products.iceberg.health(productId),
        });
        emit(io, json, polled.body);
        return polled.exitCode;
      }
      const tracked = trackedRebuildJobIds(health);
      const rebuild =
        health.rebuild_status && typeof health.rebuild_status === 'object'
          ? (health.rebuild_status as Record<string, unknown>)
          : undefined;
      if (requested && tracked.ids.length > 0 && !tracked.ids.includes(requested)) {
        emit(io, json, {
          code: 'job_not_current',
          job_id: requested,
          current_job_id: tracked.current,
          status: tracked.status,
          health,
          completed: false,
        });
        return 1;
      }
      const sameJob = !requested || tracked.ids.includes(requested);
      emit(io, json, {
        job_id: requested ?? rebuild?.job_id ?? tracked.current,
        status: rebuild?.status,
        completed: sameJob && rebuild?.status === 'completed',
        health,
      });
      return 0;
    }

    if (action === 'cancel') {
      const result = await client.build.data_products.iceberg.cancel(productId);
      emit(io, json, { ...result, completed: false });
      return 0;
    }

    if (action === 'enable') {
      const configText = argValue(args, '--config') ?? (argValue(args, '--file') ? await readFile(argValue(args, '--file') as string, 'utf8') : undefined);
      if (!configText) {
        return fail(io, json, 'config_required', 'enable requires --config <json> or --file <path>. No partition is invented.');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(configText);
      } catch {
        return fail(io, json, 'invalid_config', 'Iceberg config must be JSON');
      }
      const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      const icebergConfig = record.iceberg_config ?? record;
      const window = argValue(args, '--backfill-from');
      if (window && !ENABLE_WINDOWS.has(window)) {
        return fail(
          io,
          json,
          'unsupported_scope',
          'enable --backfill-from accepts now, 1h, 6h, 1d, 7d, 30d, or all. Omit it to load no history. z/ event ids are not accepted here.'
        );
      }
      const body: Record<string, unknown> = { iceberg_config: icebergConfig };
      if (window) body.backfill_from = window;
      const result = await client.build.data_products.iceberg.enable(productId, body);
      emit(io, json, result);
      return 0;
    }

    if (action === 'config') {
      if (hasFlag(args, '--put')) {
        const file = argValue(args, '--file');
        if (!file) return fail(io, json, 'file_required', 'config --put requires --file <json>');
        const parsed = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
        const result = await client.build.data_products.iceberg.put_config(productId, parsed);
        emit(io, json, result);
        return 0;
      }
      const status = await client.build.data_products.iceberg.status(productId);
      emit(io, json, {
        source: 'GET /dataproducts/{id}/iceberg',
        iceberg_config: status.iceberg_config ?? null,
        status,
      });
      return 0;
    }

    if (action === 'health') {
      emit(io, json, await client.build.data_products.iceberg.health(productId));
      return 0;
    }
    if (action === 'files') {
      emit(io, json, await client.build.data_products.iceberg.files(productId));
      return 0;
    }
    if (action === 'snapshots') {
      emit(io, json, await client.build.data_products.iceberg.snapshots(productId));
      return 0;
    }
    if (action === 'schema') {
      const [product, health, icebergStatus] = await Promise.all([
        client.build.data_products.get(productId, { include_schema: true }),
        client.build.data_products.iceberg.health(productId),
        client.build.data_products.iceberg.status(productId),
      ]);
      const assessment =
        health.assessment && typeof health.assessment === 'object'
          ? (health.assessment as Record<string, unknown>)
          : null;
      const configured =
        icebergStatus.iceberg_config && typeof icebergStatus.iceberg_config === 'object'
          ? (icebergStatus.iceberg_config as Record<string, unknown>)
          : null;
      emit(io, json, {
        catalog: (product as { schema?: unknown }).schema ?? null,
        physical: assessment
          ? {
              metadata_fields: assessment.metadata_fields ?? [],
              partition: assessment.metadata_partition_summary ?? assessment.registered_partition_summary ?? null,
              total_data_files: assessment.total_data_files ?? null,
              snapshot_count: assessment.snapshot_count ?? null,
              configured_partition: configured?.partition ?? configured?.partition_spec ?? null,
            }
          : {
              metadata_fields: null,
              partition: null,
              total_data_files: null,
              snapshot_count: null,
              configured_partition: configured?.partition ?? configured?.partition_spec ?? null,
            },
        materialization: {
          status: assessment?.status ?? null,
          needs_rebuild: assessment?.needs_rebuild ?? null,
          rebuild_status: health.rebuild_status ?? null,
          backfill_status: health.backfill_status ?? null,
          writer_sync: health.writer_sync ?? icebergStatus.writer_sync ?? null,
        },
        inspection: inspectionOf(health),
      });
      return 0;
    }
    return fail(io, json, 'usage', `Unknown iceberg action ${action}`);
  } catch (err) {
    const fields = errorFields(err);
    return fail(io, json, fields.code || 'request_failed', fields.message, {
      job_id: fields.job_id,
    });
  }
}

export async function executeExport(
  client: LoxtepClient,
  args: string[],
  io: CliIo = defaultIo
): Promise<number> {
  const json = hasFlag(args, '--json');
  applyInstance(client, args, io, json);
  const missing = requireInstance(client, io, json);
  if (missing) return missing;
  const productId = args[0];
  if (!productId || productId.startsWith('--')) {
    return fail(io, json, 'usage', 'loxtep data-products export <product-id> --start <eid> | --from-beginning');
  }
  if (!hasFlag(args, '--from-beginning') && !argValue(args, '--start')) {
    return fail(io, json, 'start_required', 'export requires --start <eid> or --from-beginning');
  }
  const limitText = argValue(args, '--limit');
  const pagesText = argValue(args, '--max-pages');
  try {
    const result = await client.build.data_products.export_events(productId, {
      start: argValue(args, '--start'),
      end: argValue(args, '--end'),
      from_beginning: hasFlag(args, '--from-beginning'),
      limit: limitText ? Number(limitText) : undefined,
      max_pages: pagesText ? Number(pagesText) : undefined,
    });
    emit(io, json, result);
    return 0;
  } catch (err) {
    const fields = errorFields(err);
    return fail(io, json, fields.code || 'request_failed', fields.message);
  }
}

export async function executePrimaryEntity(
  client: LoxtepClient,
  productId: string,
  io: CliIo = defaultIo,
  json = false
): Promise<number> {
  try {
    const product = await client.build.data_products.get(productId, { include_schema: true });
    const schema = (product as { schema?: { entities?: unknown; fields?: unknown } }).schema;
    emit(io, json, {
      data_product_id: productId,
      entities: schema?.entities ?? [],
      writable: false,
      message:
        'Primary entity is read from schema.entities. Change it with define submit-shape, then approve and apply. This command does not invent a key.',
    });
    return 0;
  } catch (err) {
    const fields = errorFields(err);
    return fail(io, json, fields.code || 'request_failed', fields.message);
  }
}

export async function executeGlossary(
  client: LoxtepClient,
  args: string[],
  io: CliIo = defaultIo
): Promise<number> {
  const json = hasFlag(args, '--json');
  const action = args[0];
  const productId = args[1];
  if (!productId) return fail(io, json, 'usage', 'loxtep define glossary|apply-glossary <product-id>');
  try {
    if (action === 'glossary') {
      emit(io, json, await client.build.data_products.get_lexicon(productId));
      return 0;
    }
    if (action === 'apply-glossary') {
      const revisionText = argValue(args, '--mapping-revision');
      const result = await client.meaning.semantic.apply_glossary_bindings({
        data_product_id: productId,
        ...(revisionText ? { mapping_revision: Number(revisionText) } : {}),
      });
      emit(io, json, result);
      return 0;
    }
    return fail(io, json, 'usage', `Unknown define action ${action}`);
  } catch (err) {
    const fields = errorFields(err);
    return fail(io, json, fields.code || 'request_failed', fields.message);
  }
}

export async function executeContractUpdate(
  client: LoxtepClient,
  args: string[],
  io: CliIo = defaultIo
): Promise<number> {
  const json = hasFlag(args, '--json');
  const contractId = args[0];
  const schemaVersionId = argValue(args, '--schema-version-id');
  if (!contractId || !schemaVersionId) {
    return fail(
      io,
      json,
      'usage',
      'loxtep data-contracts update <id> --schema-version-id <uuid>'
    );
  }
  try {
    const updated = await client.define.data_contracts.update(contractId, {
      schema_version_id: schemaVersionId,
    });
    emit(io, json, updated);
    return 0;
  } catch (err) {
    const fields = errorFields(err);
    return fail(io, json, fields.code || 'request_failed', fields.message);
  }
}

export async function executeQualityRules(
  client: LoxtepClient,
  args: string[],
  io: CliIo = defaultIo
): Promise<number> {
  const json = hasFlag(args, '--json');
  const action = args[0];
  try {
    if (action === 'list') {
      emit(
        io,
        json,
        await client.define.quality_rules.list({
          data_product_id: argValue(args, '--data-product-id'),
          rule_type: argValue(args, '--rule-type'),
          severity: argValue(args, '--severity'),
        })
      );
      return 0;
    }
    if (action === 'get' && args[1]) {
      emit(
        io,
        json,
        await client.define.quality_rules.get(args[1], {
          data_product_id: argValue(args, '--data-product-id'),
        })
      );
      return 0;
    }
    if (action === 'create' || action === 'update') {
      const file = argValue(args, '--file');
      if (!file) return fail(io, json, 'file_required', `quality-rules ${action} requires --file <json>`);
      const body = JSON.parse(await readFile(file, 'utf8'));
      const result =
        action === 'create'
          ? await client.define.quality_rules.create(body)
          : await client.define.quality_rules.update(args[1], body);
      emit(io, json, result);
      return 0;
    }
    if (action === 'delete' && args[1]) {
      emit(io, json, await client.define.quality_rules.delete(args[1]));
      return 0;
    }
    return fail(
      io,
      json,
      'usage',
      'loxtep quality-rules list|get <id>|create --file <json>|update <id> --file <json>|delete <id>'
    );
  } catch (err) {
    const fields = errorFields(err);
    return fail(io, json, fields.code || 'request_failed', fields.message);
  }
}

async function runWithClient(
  options: CreateCliClientOptions,
  exec: (client: LoxtepClient) => Promise<number>
): Promise<void> {
  const { client } = await requireCliClient(options);
  const code = await exec(client);
  if (code !== 0) process.exitCode = code;
}

export async function runDataPlaneIceberg(
  args: string[],
  options: CreateCliClientOptions = {}
): Promise<void> {
  await runWithClient(options, client => executeIceberg(client, args, defaultIo));
}

export async function runDataPlaneExport(
  args: string[],
  options: CreateCliClientOptions = {}
): Promise<void> {
  await runWithClient(options, client => executeExport(client, args));
}

export async function runPrimaryEntity(
  productId: string,
  options: CreateCliClientOptions & { json?: boolean } = {}
): Promise<void> {
  await runWithClient(options, client => executePrimaryEntity(client, productId, defaultIo, Boolean(options.json)));
}

export async function runDefineGlossary(
  args: string[],
  options: CreateCliClientOptions = {}
): Promise<void> {
  await runWithClient(options, client => executeGlossary(client, args));
}

export async function runDataContractsUpdate(
  args: string[],
  options: CreateCliClientOptions = {}
): Promise<void> {
  await runWithClient(options, client => executeContractUpdate(client, args));
}

export async function runQualityRules(
  args: string[],
  options: CreateCliClientOptions = {}
): Promise<void> {
  await runWithClient(options, client => executeQualityRules(client, args));
}
