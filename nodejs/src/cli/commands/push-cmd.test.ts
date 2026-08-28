import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LoxtepError } from '../../errors/base.js';
import {
  createCliTestHarness,
  createLocalProjectHarness,
  captureCliOutput,
  expectCliSuccess,
  writeMinimalWorkflowModule,
} from '../__tests__/cli-test-harness.js';
import { MOCK_IDS, createPlatformMockFetch } from '../__tests__/mock-platform-api.js';
import { formatPushError, runPush } from './push-cmd.js';

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
      // Code-first module (deploy path); push itself discovers entity-JSON packages.
      await writeMinimalWorkflowModule(harness.projectDir, 'echo-test');

      const wfDir = join(harness.projectDir, 'workflows', MOCK_IDS.workflow_id);
      mkdirSync(wfDir, { recursive: true });
      writeFileSync(
        join(wfDir, 'workflow.json'),
        JSON.stringify(
          {
            workflow_id: MOCK_IDS.workflow_id,
            organization_id: MOCK_IDS.organization_id,
            project_id: MOCK_IDS.project_id,
            name: 'echo-test',
            workflow_type: 'ingestion',
            status: 'active',
            configuration: {},
            metadata: {},
          },
          null,
          2
        ),
        'utf-8'
      );

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

  function writeEntityPackage(projectDir: string, workflowId = MOCK_IDS.workflow_id): void {
    const wfDir = join(projectDir, 'workflows', workflowId);
    mkdirSync(wfDir, { recursive: true });
    writeFileSync(
      join(wfDir, 'workflow.json'),
      JSON.stringify(
        {
          workflow_id: workflowId,
          organization_id: MOCK_IDS.organization_id,
          project_id: MOCK_IDS.project_id,
          name: 'echo-test',
          workflow_type: 'ingestion',
          status: 'active',
          configuration: {},
          metadata: {},
        },
        null,
        2
      ),
      'utf-8'
    );
  }

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

  it('pushes bundle, reindexes, and writes push manifest', async () => {
    const harness = await createLocalProjectHarness();
    try {
      writeEntityPackage(harness.projectDir);
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
      writeEntityPackage(harness.projectDir);
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
      writeEntityPackage(harness.projectDir);
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
});
