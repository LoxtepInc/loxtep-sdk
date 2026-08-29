/**
 * Tests for `loxtep ingest create` — validation + dry_run / local write paths.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  createCliTestHarness,
  createLocalProjectHarness,
  captureCliOutput,
  expectCliSuccess,
} from '../__tests__/cli-test-harness.js';
import { MOCK_IDS, createPlatformMockFetch } from '../__tests__/mock-platform-api.js';
import { runIngestCreate } from './ingest-cmd.js';

describe('runIngestCreate', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('exits 1 when project_id is missing', async () => {
    const harness = await createCliTestHarness({ project_id: '' });
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          instance_id: MOCK_IDS.instance_id,
        },
        harness.cliOptions
      );
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Missing project_id');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when instance_id is missing', async () => {
    const harness = await createCliTestHarness({ instance_id: '' });
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          project_id: MOCK_IDS.project_id,
        },
        harness.cliOptions
      );
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Missing instance_id');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when no domains exist and domain_id is omitted', async () => {
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET' && pathname.includes('/organizations/domains')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                items: [],
                pagination: {
                  page: 1,
                  page_size: 20,
                  total: 0,
                  total_pages: 0,
                  has_next: false,
                  has_prev: false,
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          project_id: MOCK_IDS.project_id,
          instance_id: MOCK_IDS.instance_id,
          dry_run: true,
        },
        { ...harness.cliOptions, fetch_fn: fetchFn }
      );
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('No domains found');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('dry_run succeeds with session + connector reuse', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          dry_run: true,
        },
        harness.cliOptions
      );
      expectCliSuccess(out, 'dry_run', MOCK_IDS.connector_sdk_id);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('writes local package files when not dry_run', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          dry_run: false,
        },
        harness.cliOptions
      );
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.stdout).toContain(MOCK_IDS.connector_sdk_id);
      expect(out.stderr).toContain('Local package ready');
      expect(existsSync(join(harness.projectDir, 'workflows'))).toBe(true);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('reuses an explicit connector_id on dry_run', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          connector_id: MOCK_IDS.connector_sdk_id,
          dry_run: true,
        },
        harness.cliOptions
      );
      expectCliSuccess(out, 'dry_run', MOCK_IDS.connector_sdk_id);
      expect(out.stderr).toContain(`Using connector ${MOCK_IDS.connector_sdk_id}`);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('creates a new SDK connector when none exist', async () => {
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET' && pathname.includes('/connectors/connectors')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                items: [],
                pagination: {
                  page: 1,
                  page_size: 50,
                  total: 0,
                  total_pages: 0,
                  has_next: false,
                  has_prev: false,
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          dry_run: true,
        },
        { ...harness.cliOptions, fetch_fn: fetchFn }
      );
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.stderr).toContain('Creating SDK connector');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('picks first domain when domain_id is omitted', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          dry_run: true,
        },
        harness.cliOptions
      );
      expectCliSuccess(out, 'dry_run');
      expect(out.stderr).toContain('Using domain:');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('deploys after local write when deploy=true', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          deploy: true,
        },
        harness.cliOptions
      );
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.stderr).toContain('Saving workflow bundle');
      expect(out.stderr).toContain('Deploying project');
      expect(out.stderr).toContain('Created "app-events"');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('warns when reindex fails during deploy path', async () => {
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && pathname.includes('/reindex')) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'reindex boom' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          deploy: true,
        },
        { ...harness.cliOptions, fetch_fn: fetchFn }
      );
      expect(out.stderr).toContain('Warning: reindex failed');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});
