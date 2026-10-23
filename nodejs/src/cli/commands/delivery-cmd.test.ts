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
          table: 'public.orders_out',
          primary_key: 'order_id',
          dry_run: false,
        },
        harness.cliOptions
      );
      expectCliSuccess(out, 'delivery', MOCK_IDS.connector_sdk_id);
      expect(out.stderr).toContain('Delivery package ready');
      expect(out.stderr).toContain('transform → outbound');
      expect(
        existsSync(join(harness.projectDir, 'connectors', `${MOCK_IDS.connector_sdk_id}.json`))
      ).toBe(true);
      expect(existsSync(join(harness.projectDir, 'workflows'))).toBe(true);

      const { readdirSync, readFileSync } = await import('node:fs');
      const workflowDirs = readdirSync(join(harness.projectDir, 'workflows'));
      expect(workflowDirs.length).toBeGreaterThan(0);
      const wfDir = join(harness.projectDir, 'workflows', workflowDirs[0]!);
      const workflow = JSON.parse(readFileSync(join(wfDir, 'workflow.json'), 'utf8'));
      expect(workflow.workflow_type).toBe('delivery');
      expect(workflow.metadata.template_slug).toBe('connector-delivery');
      expect(workflow.configuration.activation).toBe('event');
      expect(typeof workflow.metadata.transform_id).toBe('string');

      const transformId = workflow.metadata.transform_id as string;
      const transform = JSON.parse(
        readFileSync(join(wfDir, 'transformations', `${transformId}.json`), 'utf8')
      );
      expect(transform.upstream_entity_type).toBe('connections');

      const connDir = join(wfDir, 'connections');
      const connFiles = readdirSync(connDir);
      expect(connFiles.length).toBe(2);
      const target = connFiles
        .map(f => JSON.parse(readFileSync(join(connDir, f), 'utf8')))
        .find((c: { connector_mode?: string }) => c.connector_mode === 'outbound');
      expect(target).toBeDefined();
      expect(target.delivery_config.table).toBe('public.orders_out');
      expect(target.delivery_config.insert_batch_size).toBe(1000);
      expect(target.delivery_config.batch_size).toBe(100);
      expect(target.delivery_config.primary_key).toEqual(['order_id']);
      expect(target.upstream_entity_type).toBe('transformations');
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
