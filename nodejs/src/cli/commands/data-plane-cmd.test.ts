import type { LoxtepClient } from '../../client/loxtep-client.js';
import {
  executeContractUpdate,
  executeExport,
  executeIceberg,
  executePrimaryEntity,
  executeQualityRules,
  pollIcebergJob,
  validateRebuildArgs,
  type CliIo,
} from './data-plane-cmd.js';

function capture(): { io: CliIo; logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    io: {
      log: line => logs.push(line),
      error: line => errors.push(line),
    },
  };
}

function parse(lines: string[]): Record<string, unknown> {
  return JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
}

function client(overrides: {
  instance_id?: string | null;
  rebuild?: jest.Mock;
  health?: jest.Mock;
  status?: jest.Mock;
  cancel?: jest.Mock;
  enable?: jest.Mock;
  put_config?: jest.Mock;
  export_events?: jest.Mock;
  get?: jest.Mock;
  updateContract?: jest.Mock;
  qualityGet?: jest.Mock;
}): LoxtepClient & { setInstanceId: (id: string | undefined) => void } {
  const state = {
    instance_id: overrides.instance_id === null ? undefined : overrides.instance_id ?? 'instance-a',
  };
  const api = {
    instance_id: state.instance_id,
    setInstanceId(id: string | undefined) {
      state.instance_id = id;
      this.instance_id = id;
    },
    build: {
      data_products: {
        get: overrides.get ?? jest.fn(async () => ({ schema: { entities: [] } })),
        export_events: overrides.export_events ?? jest.fn(),
        iceberg: {
          rebuild: overrides.rebuild ?? jest.fn(),
          health: overrides.health ?? jest.fn(async () => ({})),
          status: overrides.status ?? jest.fn(async () => ({})),
          cancel: overrides.cancel ?? jest.fn(),
          enable: overrides.enable ?? jest.fn(),
          put_config: overrides.put_config ?? jest.fn(),
          files: jest.fn(),
          snapshots: jest.fn(),
        },
      },
    },
    define: {
      data_contracts: {
        update: overrides.updateContract ?? jest.fn(async () => ({ contract_id: 'c-1' })),
      },
      quality_rules: {
        get: overrides.qualityGet ?? jest.fn(),
        list: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    },
  };
  return api as unknown as LoxtepClient & { setInstanceId: (id: string | undefined) => void };
}

describe('validateRebuildArgs', () => {
  it('rejects omitted scope, relative windows, and a real rebuild without confirm', () => {
    const missing = validateRebuildArgs(['rebuild', 'dp']);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('scope_required');
    for (const mode of ['start', 'all', 'now', '1h', '30d']) {
      const rejected = validateRebuildArgs(['--backfill-from', mode, '--confirm']);
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.code).toBe('unsupported_scope');
    }
    const unconfirmed = validateRebuildArgs(['--backfill-from', 'z/1']);
    expect(unconfirmed.ok).toBe(false);
    if (!unconfirmed.ok) expect(unconfirmed.code).toBe('confirm_required');
  });

  it('accepts an explicit z/ point, checkpoint, or start_of_queue', () => {
    const direct = validateRebuildArgs(['--backfill-from', 'z/2026/10/10/1', '--confirm']);
    expect(direct.ok && direct.body).toMatchObject({
      confirm: true,
      backfill_from: 'z/2026/10/10/1',
      dry_run: false,
    });
    expect(direct.ok && direct.end_bound).toBe('evergreen');

    const checkpoint = validateRebuildArgs([
      '--backfill-from',
      'checkpoint',
      '--start-checkpoint',
      'z/2',
      '--end-checkpoint',
      'z/9',
      '--dry-run',
    ]);
    expect(checkpoint.ok && checkpoint.body).toEqual({
      confirm: true,
      backfill_from: 'checkpoint',
      start_checkpoint: 'z/2',
      end_checkpoint: 'z/9',
      dry_run: true,
    });

    const missingStart = validateRebuildArgs(['--backfill-from', 'checkpoint', '--dry-run']);
    expect(missingStart.ok).toBe(false);
    if (!missingStart.ok) expect(missingStart.code).toBe('start_checkpoint_required');
    const badEnd = validateRebuildArgs(['--backfill-from', 'z/1', '--end-checkpoint', 'latest', '--confirm']);
    expect(badEnd.ok).toBe(false);
    if (!badEnd.ok) expect(badEnd.code).toBe('invalid_end_checkpoint');
    const start = validateRebuildArgs(['--backfill-from', 'start_of_queue', '--confirm']);
    expect(start.ok && start.body.backfill_from).toBe('start_of_queue');
  });
});

describe('executeIceberg', () => {
  it('sends a read-only dry run without --confirm and keeps the accepted job id', async () => {
    const rebuild = jest.fn(async () => ({
      job_id: 'job-1',
      status: 'dry_run',
      queue_name: 'q-events',
      data_product_id: 'dp-1',
    }));
    const { io, logs } = capture();
    const code = await executeIceberg(
      client({ rebuild }),
      ['rebuild', 'dp-1', '--backfill-from', 'z/1', '--dry-run', '--json'],
      io
    );
    expect(code).toBe(0);
    expect(rebuild).toHaveBeenCalledWith('dp-1', {
      confirm: true,
      backfill_from: 'z/1',
      dry_run: true,
    });
    const receipt = parse(logs);
    expect(receipt).toMatchObject({
      job_id: 'job-1',
      queue_name: 'q-events',
      status: 'dry_run',
      completed: false,
      end_bound: 'evergreen',
      confirm_sent_for_api_gate: true,
      destructive: false,
    });
  });

  it('does not call rebuild when scope or confirm is missing', async () => {
    const rebuild = jest.fn();
    const { io, errors } = capture();
    expect(await executeIceberg(client({ rebuild }), ['rebuild', 'dp-1', '--json'], io)).toBe(1);
    expect(await executeIceberg(client({ rebuild }), ['rebuild', 'dp-1', '--backfill-from', 'all', '--json'], io)).toBe(1);
    expect(await executeIceberg(client({ rebuild }), ['rebuild', 'dp-1', '--backfill-from', 'z/1', '--json'], io)).toBe(1);
    expect(rebuild).not.toHaveBeenCalled();
    expect(errors.map(line => JSON.parse(line).code)).toEqual([
      'scope_required',
      'unsupported_scope',
      'confirm_required',
    ]);
  });

  it('preserves already_running and endpoint_missing', async () => {
    const running = Object.assign(new Error('rebuild already running'), {
      details: { code: 'already_running', job_id: 'job-live' },
    });
    const missing = Object.assign(new Error('cancel route missing'), {
      details: { code: 'endpoint_missing' },
    });
    const rebuild = jest.fn(async () => {
      throw running;
    });
    const cancel = jest.fn(async () => {
      throw missing;
    });
    const { io, errors } = capture();
    const code = await executeIceberg(
      client({ rebuild, cancel }),
      ['rebuild', 'dp-1', '--backfill-from', 'z/1', '--confirm', '--json'],
      io
    );
    expect(code).toBe(1);
    expect(JSON.parse(errors[0])).toMatchObject({ code: 'already_running', job_id: 'job-live' });
    const cancelCode = await executeIceberg(client({ rebuild, cancel }), ['cancel', 'dp-1', '--json'], io);
    expect(cancelCode).toBe(1);
    expect(JSON.parse(errors[1]).code).toBe('endpoint_missing');
    expect(errors[1]).not.toMatch(/cancelled/);
  });

  it('waits on the accepted job and times out without another rebuild or a cancel', async () => {
    const rebuild = jest.fn(async () => ({ job_id: 'job-1', status: 'queued', queue_name: 'q' }));
    const health = jest.fn(async () => ({
      rebuild_status: { job_id: 'job-1', status: 'backfilling' },
    }));
    const cancel = jest.fn();
    const { io, logs } = capture();
    const code = await executeIceberg(
      client({ rebuild, health, cancel }),
      ['rebuild', 'dp-1', '--backfill-from', 'start_of_queue', '--confirm', '--wait', '0s', '--json'],
      io,
      { now: () => 0, sleep: async () => undefined }
    );
    expect(code).toBe(2);
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(health).toHaveBeenCalledTimes(1);
    expect(parse(logs)).toMatchObject({
      code: 'wait_timeout',
      job_id: 'job-1',
      status: 'backfilling',
      completed: false,
    });
  });

  it('returns job_not_current when health tracks another job', async () => {
    const rebuild = jest.fn(async () => ({ job_id: 'job-1', status: 'queued' }));
    const health = jest.fn(async () => ({
      rebuild_status: { job_id: 'job-other', backfill_job_id: 'job-other', status: 'completed' },
    }));
    const { io } = capture();
    const code = await executeIceberg(
      client({ rebuild, health }),
      ['rebuild', 'dp-1', '--backfill-from', 'z/1', '--confirm', '--wait', '30s', '--json'],
      io,
      { now: () => 0, sleep: async () => undefined }
    );
    expect(code).toBe(1);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('completes only when the accepted id is on the health job', async () => {
    const result = await pollIcebergJob({
      jobId: 'job-1',
      waitMs: 0,
      intervalMs: 1,
      now: () => 0,
      sleep: async () => undefined,
      readHealth: async () => ({
        rebuild_status: { job_id: 'catalog-job', backfill_job_id: 'job-1', status: 'completed' },
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.body.completed).toBe(true);

    const unlabeled = await pollIcebergJob({
      jobId: 'job-1',
      waitMs: 0,
      intervalMs: 1,
      now: () => 0,
      sleep: async () => undefined,
      readHealth: async () => ({ rebuild_status: { status: 'completed' } }),
    });
    expect(unlabeled.exitCode).toBe(2);
    expect(unlabeled.body.completed).toBe(false);
  });

  it('keeps event_type in the catalog when physical metadata omits it', async () => {
    const get = jest.fn(async () => ({
      schema: { fields: [{ name: 'event_type' }, { name: 'payload' }] },
    }));
    const health = jest.fn(async () => ({
      assessment: {
        status: 'schema_mismatch',
        needs_rebuild: true,
        metadata_fields: ['payload'],
        total_data_files: 2,
        snapshot_count: 1,
      },
      rebuild_status: { status: 'idle' },
    }));
    const status = jest.fn(async () => ({ iceberg_config: { partition: ['day'] } }));
    const { io, logs } = capture();
    const code = await executeIceberg(client({ get, health, status }), ['schema', 'dp-1', '--json'], io);
    expect(code).toBe(0);
    const body = parse(logs);
    expect(body.catalog).toEqual({ fields: [{ name: 'event_type' }, { name: 'payload' }] });
    expect(body.physical).toMatchObject({ metadata_fields: ['payload'], configured_partition: ['day'] });
    expect(body.materialization).toMatchObject({ status: 'schema_mismatch' });
    expect(body.inspection).toBe('ok');
    expect(status).toHaveBeenCalledWith('dp-1');
  });

  it('reports managed_s3_tables inspection as unknown and empty_ok separately', async () => {
    const { io, logs } = capture();
    const unknown = await executeIceberg(
      client({
        get: jest.fn(async () => ({ schema: { fields: [] } })),
        health: jest.fn(async () => ({ assessment: { status: 'managed_s3_tables' } })),
        status: jest.fn(async () => ({})),
      }),
      ['schema', 'dp-1', '--json'],
      io
    );
    expect(unknown).toBe(0);
    expect(parse(logs).inspection).toBe('unknown');

    const empty = await executeIceberg(
      client({
        get: jest.fn(async () => ({ schema: { fields: [] } })),
        health: jest.fn(async () => ({ assessment: { status: 'empty_ok', metadata_fields: [] } })),
        status: jest.fn(async () => ({})),
      }),
      ['schema', 'dp-2', '--json'],
      io
    );
    expect(empty).toBe(0);
    expect(JSON.parse(logs[1]).inspection).toBe('empty_ok');
  });

  it('does not invent an enable partition and omits history when no window is passed', async () => {
    const enable = jest.fn(async () => ({ iceberg_enabled: true }));
    const { io, errors, logs } = capture();
    expect(await executeIceberg(client({ enable }), ['enable', 'dp-1', '--json'], io)).toBe(1);
    expect(JSON.parse(errors[0]).code).toBe('config_required');
    expect(enable).not.toHaveBeenCalled();
    const code = await executeIceberg(
      client({ enable }),
      ['enable', 'dp-1', '--config', '{"partition_spec":[]}', '--json'],
      io
    );
    expect(code).toBe(0);
    expect(enable).toHaveBeenCalledWith('dp-1', { iceberg_config: { partition_spec: [] } });
    expect(parse([logs[0]]).iceberg_enabled).toBe(true);
  });

  it('sets the instance header override before rebuild', async () => {
    const rebuild = jest.fn(async () => ({ job_id: 'job-1', status: 'queued' }));
    const api = client({ instance_id: 'attached', rebuild });
    const { io } = capture();
    await executeIceberg(
      api,
      ['rebuild', 'dp-1', '--instance', 'instance-override', '--backfill-from', 'z/1', '--confirm'],
      io
    );
    expect(api.instance_id).toBe('instance-override');
  });
});

describe('executeExport', () => {
  it('does not fetch without an instance or an explicit start', async () => {
    const export_events = jest.fn();
    const { io, errors } = capture();
    const bare = client({ instance_id: null, export_events });
    expect(await executeExport(bare, ['dp-1', '--start', 'z/1', '--json'], io)).toBe(1);
    expect(await executeExport(client({ export_events }), ['dp-1', '--json'], io)).toBe(1);
    expect(export_events).not.toHaveBeenCalled();
    expect(errors.map(line => JSON.parse(line).code)).toEqual(['instance_required', 'start_required']);
  });

  it('prints the read-only export result', async () => {
    const export_events = jest.fn(async () => ({
      events: [{ eid: 'z/1' }],
      truncated: false,
      checkpoint_committed: false,
      read_only: true,
    }));
    const { io, logs } = capture();
    const code = await executeExport(
      client({ export_events }),
      ['dp-1', '--start', 'z/1', '--limit', '10', '--json'],
      io
    );
    expect(code).toBe(0);
    expect(export_events).toHaveBeenCalledWith('dp-1', {
      start: 'z/1',
      end: undefined,
      from_beginning: false,
      limit: 10,
      max_pages: undefined,
    });
    expect(parse(logs).checkpoint_committed).toBe(false);
  });
});

describe('governance commands', () => {
  it('updates a contract schema binding', async () => {
    const updateContract = jest.fn(async () => ({ contract_id: 'c-1', schema_version_id: 'sv-1' }));
    const { io, logs } = capture();
    const code = await executeContractUpdate(
      client({ updateContract }),
      ['c-1', '--schema-version-id', 'sv-1', '--json'],
      io
    );
    expect(code).toBe(0);
    expect(updateContract).toHaveBeenCalledWith('c-1', { schema_version_id: 'sv-1' });
    expect(parse(logs).schema_version_id).toBe('sv-1');
  });

  it('reads primary entity without writing a key', async () => {
    const get = jest.fn(async () => ({ schema: { entities: [{ name: 'event', natural_key: [] }] } }));
    const { io, logs } = capture();
    const code = await executePrimaryEntity(client({ get }), 'dp-1', io, true);
    expect(code).toBe(0);
    expect(parse(logs)).toMatchObject({ writable: false, entities: [{ name: 'event', natural_key: [] }] });
  });

  it('surfaces a quality rule missing from the list', async () => {
    const qualityGet = jest.fn(async () => {
      const err = new Error('not in list');
      (err as { code?: string }).code = 'not_in_list';
      throw err;
    });
    const { io, errors } = capture();
    const code = await executeQualityRules(client({ qualityGet }), ['get', 'rule-1', '--json'], io);
    expect(code).toBe(1);
    expect(JSON.parse(errors[0]).code).toBe('not_in_list');
  });
});
