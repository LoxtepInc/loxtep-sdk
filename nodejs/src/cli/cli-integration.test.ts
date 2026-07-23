/**
 * CLI integration tests — every read-only API-backed command against a mock platform
 * with production-shaped `{ success, data }` responses.
 */

import { runWhoami } from './commands/whoami.js';
import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runDomainsList, runDomainsGet } from './commands/domains-cmd.js';
import { runStandardsList, runStandardsGet } from './commands/standards-cmd.js';
import {
  runDataContractsList,
  runDataContractsGet,
} from './commands/data-contracts-cmd.js';
import {
  runDataProductsList,
  runDataProductsGet,
  runDataProductsQuery,
  runDataProductsTables,
} from './commands/data-products-cmd.js';
import {
  runWorkflowsList,
  runWorkflowsGet,
} from './commands/workflows-cmd.js';
import { runTriggersList, runTriggersGet } from './commands/triggers-cmd.js';
import {
  runInstancesList,
  runInstancesGet,
  runInstancesDeploymentUrls,
  runInstancesRegistration,
} from './commands/instances-cmd.js';
import { runObserveStatus } from './commands/observe-cmd.js';
import { runQueueInfo, runQueueCheckpoint } from './commands/queue-cmd.js';
import { runMetricsRateLimits, runMetricsLog } from './commands/metrics-cmd.js';
import { runActivityListCommand } from './commands/activity-cmd.js';
import { runImprovementsListCommand } from './commands/improvements-cmd.js';
import { requireCliClient } from './create-cli-client.js';
import { readCredentials } from './credentials.js';
import {
  createCliTestHarness,
  captureCliOutput,
  expectCliSuccess,
  parseCliJson,
} from './__tests__/cli-test-harness.js';
import { MOCK_IDS } from './__tests__/mock-platform-api.js';
import type { CreateCliClientOptions } from './create-cli-client.js';

describe('CLI integration (mock platform API)', () => {
  let harness: Awaited<ReturnType<typeof createCliTestHarness>>;

  beforeEach(async () => {
    delete process.env.LOXTEP_AUTH_TOKEN;
    process.exitCode = 0;
    harness = await createCliTestHarness();
  });

  afterEach(async () => {
    await harness.destroy();
  });

  const opts = (): CreateCliClientOptions => harness.cliOptions;

  describe('Authentication', () => {
    it('login writes credentials then whoami prints user and org', async () => {
      await runLogin({
        email: 'flow@test.com',
        password: 'secret',
        mfa_code: '',
        fetchFn: harness.fetchFn,
        configFilePath: harness.configPath,
        credentialsPath: harness.credentialsPath,
      });
      const creds = await readCredentials(harness.credentialsPath);
      expect(creds?.access_token).toBeTruthy();

      const out = captureCliOutput();
      await runWhoami({
        credentialsPath: harness.credentialsPath,
        configFilePath: harness.configPath,
        fetchFn: harness.fetchFn,
      });
      expectCliSuccess(out, 'cli-user@test.loxtep.com', 'Test Organization');
      out.restore();
    });

    it('whoami does not print placeholders when API returns nested user/org', async () => {
      const out = captureCliOutput();
      await runWhoami(opts());
      expect(out.text).not.toMatch(/User:\s*—/);
      expect(out.text).toContain('cli-user@test.loxtep.com');
      out.restore();
    });

    it('logout removes credentials file', async () => {
      const { mkdir, copyFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const loxtepDir = join(harness.configDir, '.loxtep');
      const localCreds = join(loxtepDir, 'credentials.json');
      await mkdir(loxtepDir, { recursive: true });
      await copyFile(harness.credentialsPath, localCreds);

      const out = captureCliOutput();
      await runLogout({ cwd: harness.configDir });
      expect(out.text).toContain('Logged out');
      expect(await readCredentials(localCreds)).toBeNull();
      out.restore();
    });
  });

  describe('Governance', () => {
    it('domains list', async () => {
      const out = captureCliOutput();
      await runDomainsList(opts());
      expectCliSuccess(out, MOCK_IDS.domain_id);
      out.restore();
    });

    it('domains get', async () => {
      const out = captureCliOutput();
      await runDomainsGet(MOCK_IDS.domain_id, opts());
      expectCliSuccess(out, MOCK_IDS.domain_id, 'Test Domain');
      out.restore();
    });

    it('standards list', async () => {
      const out = captureCliOutput();
      await runStandardsList(opts());
      expectCliSuccess(out, MOCK_IDS.standard_id);
      out.restore();
    });

    it('standards get', async () => {
      const out = captureCliOutput();
      await runStandardsGet(MOCK_IDS.standard_id, opts());
      expectCliSuccess(out, 'PII Handling');
      out.restore();
    });

    it('data-contracts list', async () => {
      const out = captureCliOutput();
      await runDataContractsList(opts());
      expectCliSuccess(out, MOCK_IDS.contract_id);
      out.restore();
    });

    it('data-contracts get', async () => {
      const out = captureCliOutput();
      await runDataContractsGet(MOCK_IDS.contract_id, opts());
      expectCliSuccess(out, 'Orders SLA');
      out.restore();
    });
  });

  describe('Build & analytics', () => {
    it('data-products list', async () => {
      const out = captureCliOutput();
      await runDataProductsList(opts());
      expectCliSuccess(out, MOCK_IDS.data_product_id);
      out.restore();
    });

    it('data-products get', async () => {
      const out = captureCliOutput();
      await runDataProductsGet(MOCK_IDS.data_product_id, opts());
      expectCliSuccess(out, 'Orders');
      out.restore();
    });

    it('data-products query', async () => {
      const out = captureCliOutput();
      await runDataProductsQuery(MOCK_IDS.data_product_id, 'SELECT 1', opts());
      expectCliSuccess(out, 'order-1');
      out.restore();
    });

    it('data-products tables', async () => {
      const out = captureCliOutput();
      await runDataProductsTables(MOCK_IDS.data_product_id, opts());
      const parsed = parseCliJson(out.stdout) as { items?: { name: string }[] };
      expect(parsed.items?.[0]?.name).toBe('orders');
      out.restore();
    });

    it('workflows list', async () => {
      const out = captureCliOutput();
      await runWorkflowsList(opts());
      expectCliSuccess(out, MOCK_IDS.workflow_id);
      out.restore();
    });

    it('workflows get', async () => {
      const out = captureCliOutput();
      await runWorkflowsGet(MOCK_IDS.workflow_id, opts());
      expectCliSuccess(out, 'Ingest Orders');
      out.restore();
    });

    it('triggers list', async () => {
      const out = captureCliOutput();
      await runTriggersList(opts());
      expectCliSuccess(out, MOCK_IDS.trigger_id);
      out.restore();
    });

    it('triggers get', async () => {
      const out = captureCliOutput();
      await runTriggersGet(MOCK_IDS.trigger_id, opts());
      expectCliSuccess(out, 'Shopify');
      out.restore();
    });
  });

  describe('Workspace & instances', () => {
    it('instances list', async () => {
      const out = captureCliOutput();
      await runInstancesList({
        configFilePath: opts().configFilePath,
        credentialsPath: opts().credentialsPath,
        fetch_fn: opts().fetch_fn,
      });
      expectCliSuccess(out, MOCK_IDS.instance_id);
      out.restore();
    });

    it('instances get', async () => {
      const out = captureCliOutput();
      await runInstancesGet(MOCK_IDS.instance_id, opts());
      expectCliSuccess(out, 'Test Instance');
      out.restore();
    });

    it('instances deployment-urls', async () => {
      const out = captureCliOutput();
      await runInstancesDeploymentUrls(opts());
      expectCliSuccess(out, 'cloudformation');
      out.restore();
    });

    it('instances registration', async () => {
      const out = captureCliOutput();
      await runInstancesRegistration(opts());
      expectCliSuccess(out, 'ext-test-001');
      out.restore();
    });
  });

  describe('Observe & metrics', () => {
    it('observe status', async () => {
      const out = captureCliOutput();
      await runObserveStatus(opts());
      expectCliSuccess(out, MOCK_IDS.bot_id);
      out.restore();
    });

    it('queue info by data product id', async () => {
      const out = captureCliOutput();
      await runQueueInfo(MOCK_IDS.data_product_id, opts());
      expectCliSuccess(out, MOCK_IDS.queue_name);
      out.restore();
    });

    it('queue info by queue name', async () => {
      const out = captureCliOutput();
      await runQueueInfo(MOCK_IDS.queue_name, { ...opts(), queueName: true });
      expectCliSuccess(out, MOCK_IDS.queue_name);
      out.restore();
    });

    it('queue checkpoint', async () => {
      const out = captureCliOutput();
      await runQueueCheckpoint(MOCK_IDS.data_product_id, MOCK_IDS.bot_id, opts());
      expectCliSuccess(out, MOCK_IDS.queue_name);
      out.restore();
    });

    it('metrics rate-limits', async () => {
      const out = captureCliOutput();
      await runMetricsRateLimits(opts());
      expectCliSuccess(out, 'remaining');
      out.restore();
    });

    it('metrics log', async () => {
      const out = captureCliOutput();
      await runMetricsLog({ id: 'test.metric', value: 42 }, opts());
      expectCliSuccess(out, 'test.metric');
      out.restore();
    });
  });

  describe('Review & activity', () => {
    it('improvements list', async () => {
      const { client } = await requireCliClient(opts());
      const result = await runImprovementsListCommand(client);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toContain('imp-001');
    });

    it('activity list', async () => {
      const { client } = await requireCliClient(opts());
      const result = await runActivityListCommand(client, { limit: 10 });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toContain(MOCK_IDS.user_id);
    });
  });
});
