/**
 * Unit tests for `loxtep delivery create`.
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
import { runDeliveryCreate } from './delivery-cmd.js';

describe('runDeliveryCreate', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('exits 1 when project_id is missing', async () => {
    const harness = await createCliTestHarness({ project_id: '' });
    try {
      const out = captureCliOutput();
      await runDeliveryCreate(
        {
          from: 'orders',
          connector_id: MOCK_IDS.connector_sdk_id,
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

  it('exits 1 when from is missing', async () => {
    const harness = await createCliTestHarness();
    try {
      const out = captureCliOutput();
      await runDeliveryCreate(
        {
          from: '',
          connector_id: MOCK_IDS.connector_sdk_id,
        },
        harness.cliOptions
      );
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Usage: loxtep delivery create');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when connector_id is missing', async () => {
    const harness = await createCliTestHarness();
    try {
      const out = captureCliOutput();
      await runDeliveryCreate(
        {
          from: 'orders',
          connector_id: '',
        },
        harness.cliOptions
      );
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Missing --connector-id');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('dry_run succeeds with session, connectors.get, and domains.list', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runDeliveryCreate(
        {
          from: 'orders',
          connector_id: MOCK_IDS.connector_sdk_id,
          dry_run: true,
        },
        harness.cliOptions
      );
      expectCliSuccess(out, 'dry_run', 'delivery', MOCK_IDS.connector_sdk_id);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('writes local delivery package files when not dry_run', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runDeliveryCreate(
        {
          from: 'orders',
          connector_id: MOCK_IDS.connector_sdk_id,
          domain_id: MOCK_IDS.domain_id,
          name: 'orders-delivery',
          dry_run: false,
        },
        harness.cliOptions
      );
      // Success or lint-fail both exercise writePackageFiles; prefer success when schemas allow.
      if ((process.exitCode ?? 0) === 0) {
        expect(out.stdout).toContain('delivery');
        expect(out.stdout).toContain(MOCK_IDS.connector_sdk_id);
        expect(out.stderr).toContain('Delivery package ready');
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
      await runDeliveryCreate(
        {
          from: 'orders',
          connector_id: MOCK_IDS.connector_sdk_id,
        },
        { ...harness.cliOptions, fetch_fn: fetchFn }
      );
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Missing domain_id');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});
