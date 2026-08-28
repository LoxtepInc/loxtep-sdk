/**
 * Harness-backed happy paths for config set / paths / export.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR_ENV } from '../../config/paths.js';
import {
  createCliTestHarness,
  createLocalProjectHarness,
  captureCliOutput,
  expectCliSuccess,
} from '../__tests__/cli-test-harness.js';
import { MOCK_IDS, MOCK_PLATFORM_API, createPlatformMockFetch } from '../__tests__/mock-platform-api.js';
import {
  runConfigExportFromConnector,
  runConfigExportFromDataProduct,
  runConfigList,
  runConfigPaths,
  runConfigSet,
  runInit,
} from './config-cmd.js';

describe('config-cmd harness happy paths', () => {
  const prevConfigDir = process.env[CONFIG_DIR_ENV];

  afterEach(() => {
    process.exitCode = 0;
    if (prevConfigDir === undefined) delete process.env[CONFIG_DIR_ENV];
    else process.env[CONFIG_DIR_ENV] = prevConfigDir;
  });

  it('runConfigSet updates a key under LOXTEP_CONFIG_DIR', async () => {
    const harness = await createCliTestHarness();
    process.env[CONFIG_DIR_ENV] = harness.configDir;
    try {
      const out = captureCliOutput();
      await runConfigSet('region', 'us-west-2');
      expectCliSuccess(out, 'region set to us-west-2');
      const saved = JSON.parse(await readFile(harness.configPath, 'utf-8')) as { region?: string };
      expect(saved.region).toBe('us-west-2');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runConfigSet rejects invalid keys', async () => {
    const harness = await createCliTestHarness();
    process.env[CONFIG_DIR_ENV] = harness.configDir;
    try {
      const out = captureCliOutput();
      await runConfigSet('token', 'secret');
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Invalid key');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runConfigPaths prints resolved API paths', async () => {
    const harness = await createCliTestHarness();
    process.env[CONFIG_DIR_ENV] = harness.configDir;
    try {
      const out = captureCliOutput();
      await runConfigPaths();
      expectCliSuccess(out, 'Resolved API paths', 'api_url (normalized)');
      expect(out.stdout).toContain(MOCK_PLATFORM_API);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runConfigList prints current config keys', async () => {
    const harness = await createLocalProjectHarness();
    process.env[CONFIG_DIR_ENV] = harness.configDir;
    try {
      const out = captureCliOutput();
      await runConfigList();
      expectCliSuccess(out, 'api_url:', 'organization_id:', 'project_id:');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runInit prints setup checklist', async () => {
    const out = captureCliOutput();
    await runInit();
    expectCliSuccess(out, 'setup checklist', 'loxtep login');
    out.restore();
  });

  it('runConfigExportFromDataProduct emits shell exports', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runConfigExportFromDataProduct(MOCK_IDS.data_product_id, {
        ...harness.cliOptions,
        format: 'sh',
      });
      expectCliSuccess(out, 'export LOXTEP_BOT_ID=', MOCK_IDS.bot_id);
      expect(out.stdout).toContain('LEO_EVENT=');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runConfigExportFromDataProduct supports json and env formats', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const jsonOut = captureCliOutput();
      await runConfigExportFromDataProduct(MOCK_IDS.data_product_id, {
        ...harness.cliOptions,
        format: 'json',
      });
      expectCliSuccess(jsonOut, MOCK_IDS.bot_id, 'LeoEvent');
      JSON.parse(jsonOut.stdout);
      jsonOut.restore();

      const envOut = captureCliOutput();
      await runConfigExportFromDataProduct(MOCK_IDS.data_product_id, {
        ...harness.cliOptions,
        format: 'env',
      });
      expectCliSuccess(envOut, 'LOXTEP_BOT_ID=', 'LEO_STREAM=');
      expect(envOut.stdout).not.toMatch(/^export /m);
      envOut.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runConfigExportFromConnector emits sdk_config (json)', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runConfigExportFromConnector(MOCK_IDS.connector_sdk_id, {
        ...harness.cliOptions,
        format: 'json',
      });
      expectCliSuccess(out, MOCK_IDS.organization_id, MOCK_PLATFORM_API);
      const parsed = JSON.parse(out.stdout) as { organization_id?: string };
      expect(parsed.organization_id).toBe(MOCK_IDS.organization_id);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runConfigExportFromConnector emits sh format by default', async () => {
    const harness = await createCliTestHarness();
    try {
      const out = captureCliOutput();
      await runConfigExportFromConnector(MOCK_IDS.connector_sdk_id, {
        ...harness.cliOptions,
      });
      expectCliSuccess(out, 'export LOXTEP_API_URL=', MOCK_PLATFORM_API);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});

describe('config-cmd set clears empty values', () => {
  const prevConfigDir = process.env[CONFIG_DIR_ENV];

  afterEach(() => {
    process.exitCode = 0;
    if (prevConfigDir === undefined) delete process.env[CONFIG_DIR_ENV];
    else process.env[CONFIG_DIR_ENV] = prevConfigDir;
  });

  it('clears region when value is empty', async () => {
    const harness = await createCliTestHarness({ region: 'us-east-1' });
    process.env[CONFIG_DIR_ENV] = harness.configDir;
    try {
      expect(existsSync(harness.configPath)).toBe(true);
      const out = captureCliOutput();
      await runConfigSet('region', '');
      expectCliSuccess(out, 'region set to (cleared)');
      const saved = JSON.parse(await readFile(harness.configPath, 'utf-8')) as {
        region?: string;
      };
      expect(saved.region).toBeUndefined();
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});

describe('config-cmd export error branches', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('resolves data product by name when get-by-id fails', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runConfigExportFromDataProduct('Orders', {
        ...harness.cliOptions,
        format: 'json',
      });
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.stdout).toContain(MOCK_IDS.bot_id);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when data product name is not found', async () => {
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET' && pathname.includes('/dataproducts/dataproducts')) {
          if (pathname.includes('?') || /\/dataproducts\/dataproducts\/?$/.test(pathname.split('?')[0] ?? '')) {
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
          // Use 410 so createPlatformMockFetch does not fall through on 404.
          return new Response(
            JSON.stringify({ success: false, error: { message: 'not found' } }),
            { status: 410, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      const out = captureCliOutput();
      await runConfigExportFromDataProduct('MissingDP', {
        ...harness.cliOptions,
        fetch_fn: fetchFn,
      });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('not found');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when data product lacks deployment_bindings', async () => {
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (
          method === 'GET' &&
          pathname.includes(`/dataproducts/dataproducts/${MOCK_IDS.data_product_id}`)
        ) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                data_product_id: MOCK_IDS.data_product_id,
                name: 'Orders',
                organization_id: MOCK_IDS.organization_id,
                status: 'draft',
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
      await runConfigExportFromDataProduct(MOCK_IDS.data_product_id, {
        ...harness.cliOptions,
        fetch_fn: fetchFn,
      });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('not deployed');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when stream-config resolution fails', async () => {
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET' && pathname.includes('/stream-config')) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'no streams' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      const out = captureCliOutput();
      await runConfigExportFromDataProduct(MOCK_IDS.data_product_id, {
        ...harness.cliOptions,
        fetch_fn: fetchFn,
      });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('Failed to resolve stream bus');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when sdk connector is missing sdk_config', async () => {
    const harness = await createCliTestHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET' && pathname.includes(`/connectors/connectors/${MOCK_IDS.connector_sdk_id}`)) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                connector_id: MOCK_IDS.connector_sdk_id,
                connector_type: 'sdk',
                metadata: { name: 'SDK without config' },
                organization_id: MOCK_IDS.organization_id,
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
      await runConfigExportFromConnector(MOCK_IDS.connector_sdk_id, {
        ...harness.cliOptions,
        fetch_fn: fetchFn,
      });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('missing sdk_config');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runConfigList prints streams when set on project', async () => {
    const harness = await createLocalProjectHarness({
      streams: { Region: 'us-east-1', LeoS3: 'bucket' },
    });
    process.env[CONFIG_DIR_ENV] = harness.configDir;
    try {
      const projectFile = join(harness.projectDir, '.loxtep', 'project.json');
      const cfg = JSON.parse(await readFile(projectFile, 'utf-8')) as Record<string, unknown>;
      cfg.streams = { Region: 'us-east-1', LeoS3: 'bucket' };
      await writeFile(projectFile, JSON.stringify(cfg, null, 2));
      const out = captureCliOutput();
      const prevCwd = process.cwd();
      process.chdir(harness.projectDir);
      try {
        await runConfigList();
      } finally {
        process.chdir(prevCwd);
      }
      expect(out.stdout).toMatch(/streams: \(set/);
      expect(out.stdout).toContain('workspace:');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});
