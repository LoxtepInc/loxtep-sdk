/**
 * CLI integration tests — mutating API-backed commands against mock platform POST/PUT.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runDataProductsCreate,
  runDataProductsPromote,
  runDataProductsReadiness,
} from './commands/data-products-cmd.js';
import { runWorkflowsCreate, runWorkflowsDeploy } from './commands/workflows-cmd.js';
import { runBundleSave } from './commands/bundle-cmd.js';
import { runIngestProvision } from './commands/ingest-cmd.js';
import {
  runConnectorsList,
  runConnectorsTest,
  runConnectorsCaptureSamples,
} from './commands/connectors-cmd.js';
import { runTriggersCreate, runTriggersTest } from './commands/triggers-cmd.js';
import { runDataContractsCreate } from './commands/data-contracts-cmd.js';
import {
  runInstancesCreate,
  runInstancesRegister,
} from './commands/instances-cmd.js';
import {
  runImprovementsApplyCommand,
  runImprovementsRejectCommand,
} from './commands/improvements-cmd.js';
import {
  runApprovalsApproveCommand,
  runApprovalsRejectCommand,
} from './commands/approvals-cmd.js';
import { requireCliClient } from './create-cli-client.js';
import {
  createCliTestHarness,
  captureCliOutput,
  expectCliSuccess,
} from './__tests__/cli-test-harness.js';
import { MOCK_IDS } from './__tests__/mock-platform-api.js';
import type { CreateCliClientOptions } from './create-cli-client.js';

describe('CLI integration mutations (mock platform API)', () => {
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

  describe('Build & analytics', () => {
    it('data-products create', async () => {
      const out = captureCliOutput();
      await runDataProductsCreate(
        { name: 'New Orders', kind: 'source', domain_id: MOCK_IDS.domain_id },
        opts()
      );
      expectCliSuccess(out, 'dp-created-001', 'New Orders');
      out.restore();
    });

    it('data-products readiness', async () => {
      const out = captureCliOutput();
      await runDataProductsReadiness(MOCK_IDS.data_product_id, opts());
      expectCliSuccess(out, 'promotable');
      out.restore();
    });

    it('data-products promote', async () => {
      const out = captureCliOutput();
      await runDataProductsPromote(MOCK_IDS.data_product_id, 'silver', opts());
      expectCliSuccess(out, 'Promoted to silver');
      out.restore();
    });

    it('workflows create', async () => {
      const out = captureCliOutput();
      await runWorkflowsCreate(
        { name: 'New Flow', project_id: MOCK_IDS.project_id },
        opts()
      );
      expectCliSuccess(out, 'wf-created-001');
      out.restore();
    });

    it('workflows deploy', async () => {
      const out = captureCliOutput();
      await runWorkflowsDeploy(
        {
          project_id: MOCK_IDS.project_id,
          instance_id: MOCK_IDS.instance_id,
        },
        opts()
      );
      expectCliSuccess(out, 'deploy-test-001');
      out.restore();
    });

    it('bundle save dry run', async () => {
      const out = captureCliOutput();
      mkdirSync(join(harness.configDir, '.loxtep'), { recursive: true });
      const bundlePath = join(harness.configDir, '.loxtep', 'sdk-ingest-bundle.json');
      writeFileSync(
        bundlePath,
        JSON.stringify({
          project_id: MOCK_IDS.project_id,
          files: {
            'workflow.json': {
              workflow_id: 'wf-bundle-test',
              workflow_type: 'ingestion',
              name: 'Test',
            },
          },
        })
      );
      await runBundleSave({ file: bundlePath, dry_run: true }, opts());
      expectCliSuccess(out, 'wf-bundle-test');
      out.restore();
    });

    it('connectors list sdk', async () => {
      const out = captureCliOutput();
      await runConnectorsList({ type: 'sdk' }, opts());
      expectCliSuccess(out, MOCK_IDS.connector_sdk_id, 'sdk');
      out.restore();
    });

    it('connectors test', async () => {
      const out = captureCliOutput();
      await runConnectorsTest(MOCK_IDS.connector_sdk_id, opts());
      expectCliSuccess(out, 'passed', 'true');
      out.restore();
    });

    it('connectors capture-samples', async () => {
      const out = captureCliOutput();
      await runConnectorsCaptureSamples(
        {
          connector_id: MOCK_IDS.connector_sdk_id,
          entity_type: 'products',
          limit: 5,
        },
        opts()
      );
      expectCliSuccess(out, 'products', 'sample_payloads');
      out.restore();
    });

    it('ingest provision dry run', async () => {
      const out = captureCliOutput();
      await runIngestProvision(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          project_id: MOCK_IDS.project_id,
          instance_id: MOCK_IDS.instance_id,
          dry_run: true,
        },
        opts()
      );
      expectCliSuccess(out, MOCK_IDS.connector_sdk_id);
      out.restore();
    });

    it('triggers create', async () => {
      const out = captureCliOutput();
      await runTriggersCreate(
        {
          name: 'Webhook In',
          type: 'webhook',
          key: 'webhook-in',
          project_id: MOCK_IDS.project_id,
          workflow_id: MOCK_IDS.workflow_id,
        },
        opts()
      );
      expectCliSuccess(out, 'trigger-created-001');
      out.restore();
    });

    it('triggers test', async () => {
      const out = captureCliOutput();
      await runTriggersTest(MOCK_IDS.trigger_id, {
        ...opts(),
        project_id: MOCK_IDS.project_id,
        workflow_id: MOCK_IDS.workflow_id,
      });
      expectCliSuccess(out, 'success');
      out.restore();
    });
  });

  describe('Governance & contracts', () => {
    it('data-contracts create', async () => {
      const out = captureCliOutput();
      await runDataContractsCreate(
        {
          data_product_id: MOCK_IDS.data_product_id,
          name: 'Orders SLA v2',
        },
        opts()
      );
      expectCliSuccess(out, 'contract-created-001');
      out.restore();
    });
  });

  describe('Workspace & instances', () => {
    it('instances create (shared)', async () => {
      const out = captureCliOutput();
      await runInstancesCreate(
        {
          name: 'Dev Shared',
          region: 'us-east-1',
          instance_type: 'shared',
        },
        opts()
      );
      expectCliSuccess(out, 'instance-created-001');
      out.restore();
    });

    it('instances register infrastructure', async () => {
      const out = captureCliOutput();
      await runInstancesRegister(
        'arn:aws:iam::123456789012:role/loxtep-cross-account',
        'us-east-1',
        opts()
      );
      expectCliSuccess(out, 'cross_account_role_arn');
      out.restore();
    });
  });

  describe('Review', () => {
    it('approvals approve (resolve approve)', async () => {
      const { client } = await requireCliClient(opts());
      const result = await runApprovalsApproveCommand(client, MOCK_IDS.approval_request_id);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toContain(MOCK_IDS.approval_request_id);
      expect(result.stdout.join('\n')).toContain('approved');
    });

    it('approvals reject (resolve reject)', async () => {
      const { client } = await requireCliClient(opts());
      const result = await runApprovalsRejectCommand(client, MOCK_IDS.approval_request_id);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toContain(MOCK_IDS.approval_request_id);
      expect(result.stdout.join('\n')).toContain('rejected');
    });

    it('improvements reject', async () => {
      const { client } = await requireCliClient(opts());
      const result = await runImprovementsRejectCommand(client, 'imp-001');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toContain('Rejected improvement');
    });

    it('improvements apply writes workflow file and updates status', async () => {
      const { writeFile, mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const projectDir = join(harness.configDir, 'imp-project');
      await mkdir(join(projectDir, 'workflows'), { recursive: true });
      await mkdir(join(projectDir, '.loxtep'), { recursive: true });
      await writeFile(
        join(projectDir, '.loxtep', 'project.json'),
        JSON.stringify({ project_id: MOCK_IDS.project_id }, null, 2),
        'utf-8'
      );
      await writeFile(
        join(projectDir, 'workflows', 'orders-enricher.ts'),
        'export default { name: "orders-enricher" };',
        'utf-8'
      );

      const { client } = await requireCliClient(opts());
      const result = await runImprovementsApplyCommand(client, 'imp-001', projectDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toContain('Applied improvement');
    });
  });
});
