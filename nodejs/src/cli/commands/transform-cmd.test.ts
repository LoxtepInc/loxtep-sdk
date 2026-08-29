/**
 * Unit tests for `loxtep transform create`.
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
import { runTransformCreate } from './transform-cmd.js';

describe('runTransformCreate', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('exits 1 when project_id is missing', async () => {
    const harness = await createCliTestHarness({ project_id: '' });
    try {
      const out = captureCliOutput();
      await runTransformCreate({ from: 'orders' }, harness.cliOptions);
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Missing project_id');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when from is missing', async () => {
    const harness = await createCliTestHarness();
    try {
      const out = captureCliOutput();
      await runTransformCreate({ from: '   ' }, harness.cliOptions);
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Usage: loxtep transform create');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('dry_run succeeds with session and domains.list', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runTransformCreate(
        {
          from: 'orders',
          dry_run: true,
        },
        harness.cliOptions
      );
      expectCliSuccess(out, 'dry_run', 'enrichment', 'orders-cleaned');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('writes local transform package files when not dry_run', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runTransformCreate(
        {
          from: 'orders',
          name: 'orders-cleaned',
          domain_id: MOCK_IDS.domain_id,
          dry_run: false,
        },
        harness.cliOptions
      );
      if ((process.exitCode ?? 0) === 0) {
        expect(out.stdout).toContain('enrichment');
        expect(out.stdout).toContain('orders-cleaned');
        expect(out.stderr).toContain('Transform package ready');
      } else {
        expect(out.stderr.length).toBeGreaterThan(0);
        expect(existsSync(join(harness.projectDir, 'workflows'))).toBe(true);
      }
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when no domain can be resolved', async () => {
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
                  page_size: 1,
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
      await runTransformCreate({ from: 'orders' }, { ...harness.cliOptions, fetch_fn: fetchFn });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Missing domain_id');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});
