import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LoxtepError } from '../../errors/base.js';
import {
  createCliTestHarness,
  createLocalProjectHarness,
  captureCliOutput,
  expectCliSuccess,
  writeMinimalWorkflowModule,
} from '../__tests__/cli-test-harness.js';
import { MOCK_IDS, createPlatformMockFetch } from '../__tests__/mock-platform-api.js';
import { buildSdkIngestLocalPackage } from '../../lib/sdk-ingest-bundle.js';
import { formatPushError, runPush } from './push-cmd.js';

const CONNECTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONNECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DATA_PRODUCT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function writeValidEntityPackage(
  projectDir: string,
  workflowId = MOCK_IDS.workflow_id
): void {
  const pkg = buildSdkIngestLocalPackage({
    organization_id: MOCK_IDS.organization_id,
    project_id: MOCK_IDS.project_id,
    domain_id: MOCK_IDS.domain_id,
    connector_id: CONNECTOR_ID,
    data_product_name: 'app-events',
    user_id: USER_ID,
    workflow_id: workflowId,
    connection_id: CONNECTION_ID,
    data_product_id: DATA_PRODUCT_ID,
    connector: {
      connector_id: CONNECTOR_ID,
      organization_id: MOCK_IDS.organization_id,
      connector_type: 'sdk',
      metadata: { name: 'SDK' },
    },
  });
  for (const [rel, entity] of Object.entries(pkg.files)) {
    const full = join(projectDir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, JSON.stringify(entity, null, 2), 'utf-8');
  }
}

describe('formatPushError', () => {
  it('returns Error.message for plain errors', () => {
    expect(formatPushError(new Error('boom'))).toBe('boom');
  });

  it('appends details.error when message is opaque', () => {
    const err = new LoxtepError('Workflow bundle catalog index failed', {
      code: 'UNKNOWN_ERROR',
      status_code: 500,
      details: {
        error:
          'Workflow bundle written to S3 but catalog index failed: ' +
          'a data product with this name already exists in the project',
      },
    });
    const formatted = formatPushError(err);
    expect(formatted).toContain('a data product with this name already exists');
    expect(formatted).toContain('Workflow bundle catalog index failed');
  });

  it('does not duplicate details already present in message', () => {
    const detail =
      'Workflow bundle written to S3 but catalog index failed: ' +
      'a data product with this name already exists in the project';
    const err = new LoxtepError(detail, {
      code: 'UNKNOWN_ERROR',
      status_code: 500,
      details: { error: detail },
    });
    expect(formatPushError(err)).toBe(detail);
  });

  it('strips SQL column lists from raw catalog errors', () => {
    const err = new LoxtepError('Workflow bundle catalog index failed', {
      code: 'UNKNOWN_ERROR',
      status_code: 500,
      details: {
        error:
          'Workflow bundle written to S3 but catalog index failed: insert into "data_products" ' +
          '("created_at", "name", "organization_id", "project_id") values ($1, $2, $3, $4) - ' +
          'duplicate key value violates unique constraint "data_products_project_name_unique". ' +
          'CLI list/get/get_writer will stay empty until catalog upsert succeeds.',
      },
    });
    const formatted = formatPushError(err);
    expect(formatted).toContain('a data product with this name already exists in the project');
    expect(formatted).toContain('CLI list/get/get_writer will stay empty');
    expect(formatted).not.toMatch(/insert into/i);
    expect(formatted).not.toContain('organization_id');
    expect(formatted).not.toContain('created_at');
  });
});

describe('runPush dry_run', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('lists local entity packages without calling save_workflow_bundle', async () => {
    const harness = await createLocalProjectHarness();
    try {
      await writeMinimalWorkflowModule(harness.projectDir, 'echo-test');
      writeValidEntityPackage(harness.projectDir);

      const out = captureCliOutput();
      await runPush({ dry_run: true }, harness.cliOptions);
      expectCliSuccess(out, 'dry_run', MOCK_IDS.workflow_id, MOCK_IDS.project_id);
      expect(out.stderr).toContain(`[dry-run] would push workflow ${MOCK_IDS.workflow_id}`);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});

describe('runPush write paths', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('exits 1 when project_id is missing', async () => {
    const harness = await createCliTestHarness({ project_id: '' });
    try {
      const out = captureCliOutput();
      await runPush({}, harness.cliOptions);
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Missing project_id');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when no local workflows exist', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runPush({}, harness.cliOptions);
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('No local workflows found');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('refuses push when lint fails before any mutation', async () => {
    const harness = await createLocalProjectHarness();
    let bundlePosts = 0;
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && pathname.includes('/workflow-bundle')) {
          bundlePosts += 1;
          return new Response(JSON.stringify({ success: true, data: { success: true } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      const wfDir = join(harness.projectDir, 'workflows', MOCK_IDS.workflow_id);
      mkdirSync(wfDir, { recursive: true });
      writeFileSync(
        join(wfDir, 'workflow.json'),
        JSON.stringify({ name: 'broken-incomplete' }, null, 2),
        'utf-8'
      );

      const out = captureCliOutput();
      await runPush({}, { ...harness.cliOptions, fetch_fn: fetchFn });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Push refused: local entity package failed lint');
      expect(bundlePosts).toBe(0);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('pushes bundle, reindexes, and writes push manifest', async () => {
    const harness = await createLocalProjectHarness();
    try {
      writeValidEntityPackage(harness.projectDir);
      const out = captureCliOutput();
      await runPush({ dry_run: false }, harness.cliOptions);
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.stdout).toContain(MOCK_IDS.workflow_id);
      expect(out.stderr).toContain(`Pushing workflow ${MOCK_IDS.workflow_id}`);
      expect(out.stderr).toContain('Push complete');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('records push failure and sets exitCode 1', async () => {
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && pathname.includes('/workflow-bundle')) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { message: 'bundle rejected' },
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      writeValidEntityPackage(harness.projectDir);
      const out = captureCliOutput();
      await runPush({}, { ...harness.cliOptions, fetch_fn: fetchFn });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Failed to push');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('warns when reindex fails but still reports push success', async () => {
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && pathname.includes('/reindex')) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'reindex down' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      writeValidEntityPackage(harness.projectDir);
      const out = captureCliOutput();
      await runPush({}, { ...harness.cliOptions, fetch_fn: fetchFn });
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.stderr).toContain('Warning: reindex failed');
      expect(out.stderr).toContain('Push complete');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('attaches project schema and contract files on the bundle save', async () => {
    const harness = await createLocalProjectHarness();
    const shapeId = '12121212-1212-4121-8121-121212121212';
    const contractId = '14141414-1414-4141-8141-141414141414';
    const now = '2026-08-04T12:00:00.000Z';
    const shape = {
      schema_id: shapeId,
      organization_id: MOCK_IDS.organization_id,
      data_product_id: DATA_PRODUCT_ID,
      name: 'Orders',
      version: '1.0.0',
      format: 'json-schema',
      fields: [{ name: 'order_id', type: 'string', required: true }],
      status: 'draft',
      created_at: now,
      updated_at: now,
    };
    const contract = {
      contract_id: contractId,
      organization_id: MOCK_IDS.organization_id,
      data_product_id: DATA_PRODUCT_ID,
      name: 'Orders contract',
      version: '1.0.0',
      status: 'draft',
      created_at: now,
      updated_at: now,
      schema_ref: {
        schema_version_id: shapeId,
        version: '1.0.0',
        format: 'json-schema',
      },
    };
    const bodies: Array<Record<string, unknown>> = [];
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && pathname.includes('/workflow-bundle') && init?.body) {
          bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      writeValidEntityPackage(harness.projectDir);
      mkdirSync(join(harness.projectDir, 'schemas'), { recursive: true });
      mkdirSync(join(harness.projectDir, 'contracts'), { recursive: true });
      writeFileSync(
        join(harness.projectDir, 'schemas', `${shapeId}.json`),
        JSON.stringify(shape),
        'utf-8'
      );
      writeFileSync(
        join(harness.projectDir, 'contracts', `${contractId}.json`),
        JSON.stringify(contract),
        'utf-8'
      );

      const dry = captureCliOutput();
      await runPush({ dry_run: true }, harness.cliOptions);
      expect(process.exitCode ?? 0).toBe(0);
      expect(dry.stderr).toContain('2 project files');
      dry.restore();

      const out = captureCliOutput();
      await runPush({ dry_run: false }, { ...harness.cliOptions, fetch_fn: fetchFn });
      expect(process.exitCode ?? 0).toBe(0);
      expect(bodies).toHaveLength(1);
      expect(bodies[0]?.project_files).toEqual({
        [`schemas/${shapeId}.json`]: shape,
        [`contracts/${contractId}.json`]: contract,
      });
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});
