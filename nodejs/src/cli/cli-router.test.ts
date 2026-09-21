/**
 * Covers `runCli` switch arms with mocked command handlers.
 */

jest.mock('./update-notifier.js', () => ({
  startUpdateCheck: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  waitForUpdateCheck: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./help.js', () => ({
  printCliHelp: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./version.js', () => ({
  printCliVersion: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./create-cli-client.js', () => ({
  createCliClient: jest.fn(async () => ({ client: { id: 'mock-client' }, config: {} })),
  requireCliClient: jest.fn(async () => ({ client: { id: 'mock-client' }, config: {} })),
}));

jest.mock('./commands/activity-cmd.js', () => ({
  runActivityListCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/approvals-cmd.js', () => ({
  runApprovalsListCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runApprovalsApproveCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runApprovalsRejectCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  parseApprovalsListNumericFlags: jest.fn(() => ({ ok: true })),
}));

jest.mock('./commands/attach-cmd.js', () => ({
  runAttach: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/bundle-cmd.js', () => ({
  runBundleSave: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/bus-cmd.js', () => ({
  runBusLogin: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/candidates-cmd.js', () => ({
  runCandidatesListCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runCandidatesActCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/cdlc-cmd.js', () => ({
  runCdlcTransitionCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runCdlcReviewQueueCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/config-cmd.js', () => ({
  runConfigList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runConfigPaths: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runConfigSet: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runConfigExportFromDataProduct: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runConfigExportFromConnector: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/connectors-cmd.js', () => ({
  runConnectorsList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runConnectorsTest: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runConnectorsCaptureSamples: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/data-contracts-cmd.js', () => ({
  runDataContractsList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDataContractsGet: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDataContractsCreate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/data-products-cmd.js', () => ({
  runDataProductsList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDataProductsGet: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDataProductsQuery: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDataProductsTables: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDataProductsCreate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDataProductsReadiness: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDataProductsPromote: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/delivery-cmd.js', () => ({
  runDeliveryCreate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/deploy-cmd.js', () => ({
  runDeploy: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/deployments-cmd.js', () => ({
  runDeploymentsListCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDeploymentsGetCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/domains-cmd.js', () => ({
  runDomainsList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runDomainsGet: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/generate-cmd.js', () => ({
  runGenerate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/improvements-cmd.js', () => ({
  runImprovementsListCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runImprovementsApplyCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runImprovementsRejectCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/ingest-cmd.js', () => ({
  runIngestCreate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/init-cmd.js', () => ({
  runInitCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/instances-cmd.js', () => ({
  runInstancesList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runInstancesGet: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runInstancesStreamConfig: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runInstancesCreate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runInstancesDeploymentUrls: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runInstancesRegistration: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runInstancesRegister: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runInstancesUpdate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runInstancesRedeployRuntimes: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  parseCreateInstanceArgs: jest.fn(() => ({})),
  parseUpdateInstanceArgs: jest.fn(() => ({ instanceId: 'i-1', input: {} })),
}));

jest.mock('./commands/lint-cmd.js', () => ({
  runLint: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/login.js', () => ({
  runLogin: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/logout.js', () => ({
  runLogout: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/metrics-cmd.js', () => ({
  runMetricsRateLimits: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runMetricsLog: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/observe-cmd.js', () => ({
  runObserveStatus: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/packs-cmd.js', () => ({
  runPacksListCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runPacksActivateCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runPacksStatusCommand: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/projects-cmd.js', () => ({
  runProjectsList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runProjectsGet: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runProjectsLink: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runProjectsChanges: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runProjectsClone: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runProjectsGithubPullCmd: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runProjectsGithubPushCmd: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/push-cmd.js', () => ({
  runPush: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/queue-cmd.js', () => ({
  runQueueInfo: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runQueueCheckpoint: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/standards-cmd.js', () => ({
  runStandardsList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runStandardsGet: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/status-cmd.js', () => ({
  runStatus: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/test-cmd.js', () => ({
  runTest: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/transform-cmd.js', () => ({
  runTransformCreate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/triggers-cmd.js', () => ({
  runTriggersList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runTriggersGet: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runTriggersCreate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runTriggersTest: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/whoami.js', () => ({
  runWhoami: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

jest.mock('./commands/workflows-cmd.js', () => ({
  runWorkflowsList: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runWorkflowsGet: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runWorkflowsCreate: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
  runWorkflowsDeploy: jest.fn(async () => ({ exitCode: 0, stdout: [], stderr: [] })),
}));

import { runCli } from './index.js';
import { printCliHelp } from './help.js';
import { printCliVersion } from './version.js';
import { createCliClient, requireCliClient } from './create-cli-client.js';
import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runWhoami } from './commands/whoami.js';
import { runInitCommand } from './commands/init-cmd.js';
import { runAttach } from './commands/attach-cmd.js';
import {
  runConfigList,
  runConfigPaths,
  runConfigSet,
  runConfigExportFromDataProduct,
  runConfigExportFromConnector,
} from './commands/config-cmd.js';
import { runIngestCreate } from './commands/ingest-cmd.js';
import { runTransformCreate } from './commands/transform-cmd.js';
import { runDeliveryCreate } from './commands/delivery-cmd.js';
import { runPush } from './commands/push-cmd.js';
import { runLint } from './commands/lint-cmd.js';
import { runStatus } from './commands/status-cmd.js';
import { runGenerate } from './commands/generate-cmd.js';
import { runTest } from './commands/test-cmd.js';
import { runDeploy } from './commands/deploy-cmd.js';
import { runObserveStatus } from './commands/observe-cmd.js';
import { runBusLogin } from './commands/bus-cmd.js';
import { runBundleSave } from './commands/bundle-cmd.js';
import {
  runDataProductsList,
  runDataProductsGet,
  runDataProductsQuery,
  runDataProductsTables,
  runDataProductsCreate,
  runDataProductsReadiness,
  runDataProductsPromote,
} from './commands/data-products-cmd.js';
import {
  runWorkflowsList,
  runWorkflowsGet,
  runWorkflowsCreate,
  runWorkflowsDeploy,
} from './commands/workflows-cmd.js';
import {
  runConnectorsList,
  runConnectorsTest,
  runConnectorsCaptureSamples,
} from './commands/connectors-cmd.js';
import {
  runTriggersList,
  runTriggersGet,
  runTriggersCreate,
  runTriggersTest,
} from './commands/triggers-cmd.js';
import { runDomainsList, runDomainsGet } from './commands/domains-cmd.js';
import { runStandardsList, runStandardsGet } from './commands/standards-cmd.js';
import {
  runDataContractsList,
  runDataContractsGet,
  runDataContractsCreate,
} from './commands/data-contracts-cmd.js';
import { runQueueInfo, runQueueCheckpoint } from './commands/queue-cmd.js';
import { runMetricsRateLimits, runMetricsLog } from './commands/metrics-cmd.js';
import {
  runImprovementsListCommand,
  runImprovementsApplyCommand,
  runImprovementsRejectCommand,
} from './commands/improvements-cmd.js';
import {
  runApprovalsListCommand,
  runApprovalsApproveCommand,
  runApprovalsRejectCommand,
} from './commands/approvals-cmd.js';
import {
  runCdlcTransitionCommand,
  runCdlcReviewQueueCommand,
} from './commands/cdlc-cmd.js';
import {
  runCandidatesListCommand,
  runCandidatesActCommand,
} from './commands/candidates-cmd.js';
import {
  runPacksListCommand,
  runPacksActivateCommand,
  runPacksStatusCommand,
} from './commands/packs-cmd.js';
import {
  runDeploymentsListCommand,
  runDeploymentsGetCommand,
} from './commands/deployments-cmd.js';
import { runActivityListCommand } from './commands/activity-cmd.js';
import {
  runInstancesList,
  runInstancesGet,
  runInstancesStreamConfig,
  runInstancesCreate,
  runInstancesUpdate,
  runInstancesRedeployRuntimes,
  runInstancesDeploymentUrls,
  runInstancesRegistration,
  runInstancesRegister,
  parseCreateInstanceArgs,
} from './commands/instances-cmd.js';
import {
  runProjectsList,
  runProjectsGet,
  runProjectsLink,
  runProjectsChanges,
  runProjectsClone,
  runProjectsGithubPullCmd,
  runProjectsGithubPushCmd,
} from './commands/projects-cmd.js';

const authClient = { client: { id: 'mock-client' }, config: {} };

describe('runCli router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
    (createCliClient as jest.Mock).mockResolvedValue(authClient);
    (requireCliClient as jest.Mock).mockResolvedValue(authClient);
    (parseCreateInstanceArgs as jest.Mock).mockReturnValue({
      name: 'i',
      region: 'us-east-1',
      type: 'shared',
    });
  });

  it('help and version', async () => {
    await runCli([]);
    await runCli(['--help']);
    await runCli(['-h']);
    expect(printCliHelp).toHaveBeenCalled();
    await runCli(['--version']);
    await runCli(['-V']);
    await runCli(['version']);
    expect(printCliVersion).toHaveBeenCalled();
  });

  it('auth commands', async () => {
    await runCli(['login', '--global']);
    expect(runLogin).toHaveBeenCalled();
    await runCli(['logout', '--global']);
    expect(runLogout).toHaveBeenCalledWith({ scope: 'global' });
    await runCli(['whoami']);
    expect(runWhoami).toHaveBeenCalled();
  });

  it('workspace lifecycle', async () => {
    await runCli(['init', '--name', 'Demo']);
    expect(runInitCommand).toHaveBeenCalled();
    await runCli(['attach', '--instance', 'inst-1']);
    expect(runAttach).toHaveBeenCalled();
    await runCli(['status', '--json', '--unpublished']);
    expect(runStatus).toHaveBeenCalled();
    await runCli(['generate']);
    expect(runGenerate).toHaveBeenCalled();
    await runCli(['test']);
    expect(runTest).toHaveBeenCalled();
    await runCli(['deploy']);
    expect(runDeploy).toHaveBeenCalled();
    await runCli(['push', '--dry-run']);
    expect(runPush).toHaveBeenCalled();
    await runCli(['lint', '--workflow', 'wf-1']);
    expect(runLint).toHaveBeenCalled();
  });

  it('config', async () => {
    await runCli(['config', 'list']);
    expect(runConfigList).toHaveBeenCalled();
    await runCli(['config', 'paths']);
    expect(runConfigPaths).toHaveBeenCalled();
    await runCli(['config', 'set', 'api_url', 'https://x']);
    expect(runConfigSet).toHaveBeenCalled();
    await runCli(['config', 'export', '--from-data-product', 'dp-1']);
    expect(runConfigExportFromDataProduct).toHaveBeenCalled();
    await runCli(['config', 'export', '--from-connector', 'c-1']);
    expect(runConfigExportFromConnector).toHaveBeenCalled();
  });

  it('ingest transform delivery', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await runCli(['ingest', 'create', '--name', 'n', '--domain-id', 'd']);
    expect(runIngestCreate).toHaveBeenCalled();
    await runCli(['ingest', 'provision', '--name', 'n', '--domain-id', 'd']);
    expect(runIngestCreate).toHaveBeenCalled();
    await runCli(['transform', 'create', '--from', 'dp']);
    expect(runTransformCreate).toHaveBeenCalled();
    await runCli(['delivery', 'create', '--from', 'dp', '--connector-id', 'c']);
    expect(runDeliveryCreate).toHaveBeenCalled();
    err.mockRestore();
  });

  it('catalog surfaces', async () => {
    await runCli(['data-products', 'list']);
    expect(runDataProductsList).toHaveBeenCalled();
    await runCli(['data-products', 'get', 'dp-1']);
    expect(runDataProductsGet).toHaveBeenCalled();
    await runCli(['data-products', 'query', 'dp-1', 'SELECT 1']);
    expect(runDataProductsQuery).toHaveBeenCalled();
    await runCli(['data-products', 'tables', 'dp-1']);
    expect(runDataProductsTables).toHaveBeenCalled();
    await runCli(['data-products', 'create', '--name', 'x', '--domain-id', 'd-1', '--kind', 'source']);
    expect(runDataProductsCreate).toHaveBeenCalled();
    await runCli(['data-products', 'readiness', 'dp-1']);
    expect(runDataProductsReadiness).toHaveBeenCalled();
    await runCli(['data-products', 'promote', 'dp-1', '--target', 'gold']);
    expect(runDataProductsPromote).toHaveBeenCalled();
    await runCli(['workflows', 'list']);
    expect(runWorkflowsList).toHaveBeenCalled();
    await runCli(['workflows', 'get', 'wf-1']);
    expect(runWorkflowsGet).toHaveBeenCalled();
    await runCli(['workflows', 'create', '--name', 'w', '--project-id', 'p-1']);
    expect(runWorkflowsCreate).toHaveBeenCalled();
    await runCli(['workflows', 'deploy', '--project-id', 'p-1']);
    expect(runWorkflowsDeploy).toHaveBeenCalled();
    await runCli(['connectors', 'list']);
    expect(runConnectorsList).toHaveBeenCalled();
    await runCli(['connectors', 'test', 'c-1']);
    expect(runConnectorsTest).toHaveBeenCalled();
    await runCli(['connectors', 'capture-samples', 'c-1', '--entity-type', 'products']);
    expect(runConnectorsCaptureSamples).toHaveBeenCalled();
    await runCli(['triggers', 'list']);
    expect(runTriggersList).toHaveBeenCalled();
    await runCli(['triggers', 'get', 't-1']);
    expect(runTriggersGet).toHaveBeenCalled();
    await runCli([
      'triggers',
      'create',
      '--name',
      't',
      '--type',
      'webhook',
      '--key',
      'k',
      '--project-id',
      'p-1',
      '--workflow-id',
      'wf-1',
    ]);
    expect(runTriggersCreate).toHaveBeenCalled();
    await runCli(['triggers', 'test', 't-1', '--project-id', 'p-1', '--workflow-id', 'wf-1']);
    expect(runTriggersTest).toHaveBeenCalled();
    await runCli(['domains', 'list']);
    expect(runDomainsList).toHaveBeenCalled();
    await runCli(['domains', 'get', 'd-1']);
    expect(runDomainsGet).toHaveBeenCalled();
    await runCli(['standards', 'list']);
    expect(runStandardsList).toHaveBeenCalled();
    await runCli(['standards', 'get', 's-1']);
    expect(runStandardsGet).toHaveBeenCalled();
    await runCli(['data-contracts', 'list']);
    expect(runDataContractsList).toHaveBeenCalled();
    await runCli(['data-contracts', 'get', 'dc-1']);
    expect(runDataContractsGet).toHaveBeenCalled();
    await runCli(['data-contracts', 'create', '--data-product-id', 'dp-1', '--name', 'c']);
    expect(runDataContractsCreate).toHaveBeenCalled();
  });

  it('ops and governance', async () => {
    await runCli(['observe', 'status']);
    expect(runObserveStatus).toHaveBeenCalled();
    await runCli(['bus', 'login']);
    expect(runBusLogin).toHaveBeenCalled();
    await runCli(['bundle', 'save', '--file', 'f.json']);
    expect(runBundleSave).toHaveBeenCalled();
    await runCli(['queue', 'info', 'q-1']);
    expect(runQueueInfo).toHaveBeenCalled();
    await runCli(['queue', 'checkpoint', 'q-1', '--bot', 'bot-1']);
    expect(runQueueCheckpoint).toHaveBeenCalled();
    await runCli(['metrics', 'rate-limits']);
    expect(runMetricsRateLimits).toHaveBeenCalled();
    await runCli(['metrics', 'log', '--id', 'm-1', '--value', '1']);
    expect(runMetricsLog).toHaveBeenCalled();
    await runCli(['improvements', 'list']);
    expect(runImprovementsListCommand).toHaveBeenCalled();
    await runCli(['improvements', 'apply', 'imp-1']);
    expect(runImprovementsApplyCommand).toHaveBeenCalled();
    await runCli(['improvements', 'reject', 'imp-1']);
    expect(runImprovementsRejectCommand).toHaveBeenCalled();
    await runCli(['approvals', 'list']);
    expect(runApprovalsListCommand).toHaveBeenCalled();
    await runCli(['approvals', 'approve', 'a-1']);
    expect(runApprovalsApproveCommand).toHaveBeenCalled();
    await runCli(['approvals', 'reject', 'a-1']);
    expect(runApprovalsRejectCommand).toHaveBeenCalled();
    await runCli(['cdlc', 'transition', 'e-1', '--from', 'draft', '--to', 'approved']);
    expect(runCdlcTransitionCommand).toHaveBeenCalled();
    await runCli(['cdlc', 'review-queue']);
    expect(runCdlcReviewQueueCommand).toHaveBeenCalled();
    await runCli(['candidates', 'list']);
    expect(runCandidatesListCommand).toHaveBeenCalled();
    await runCli(['candidates', 'act', 'c-1', '--action', 'accept']);
    expect(runCandidatesActCommand).toHaveBeenCalled();
    await runCli(['packs', 'list']);
    expect(runPacksListCommand).toHaveBeenCalled();
    await runCli(['packs', 'activate', 'p-1']);
    expect(runPacksActivateCommand).toHaveBeenCalled();
    await runCli(['packs', 'status']);
    expect(runPacksStatusCommand).toHaveBeenCalled();
    await runCli(['deployments', 'list']);
    expect(runDeploymentsListCommand).toHaveBeenCalled();
    await runCli(['deployments', 'get', 'd-1']);
    expect(runDeploymentsGetCommand).toHaveBeenCalled();
    await runCli(['activity', 'list']);
    expect(runActivityListCommand).toHaveBeenCalled();
  });

  it('instances and projects', async () => {
    await runCli(['instances', 'list']);
    expect(runInstancesList).toHaveBeenCalled();
    await runCli(['instances', 'get', 'i-1']);
    expect(runInstancesGet).toHaveBeenCalled();
    await runCli(['instances', 'stream-config']);
    expect(runInstancesStreamConfig).toHaveBeenCalled();
    await runCli(['instances', 'create', '--name', 'n', '--region', 'r', '--type', 'shared']);
    expect(runInstancesCreate).toHaveBeenCalled();
    await runCli(['instances', 'update', 'i-1', '--name', 'n']);
    expect(runInstancesUpdate).toHaveBeenCalled();
    await runCli(['instances', 'redeploy-runtimes', 'i-1']);
    expect(runInstancesRedeployRuntimes).toHaveBeenCalled();
    await runCli(['instances', 'deployment-urls']);
    expect(runInstancesDeploymentUrls).toHaveBeenCalled();
    await runCli(['instances', 'registration']);
    expect(runInstancesRegistration).toHaveBeenCalled();
    await runCli(['instances', 'register', '--cross-account-role-arn', 'arn:aws:iam::1:role/x']);
    expect(runInstancesRegister).toHaveBeenCalled();
    await runCli(['projects', 'list']);
    expect(runProjectsList).toHaveBeenCalled();
    await runCli(['projects', 'get', 'p-1']);
    expect(runProjectsGet).toHaveBeenCalled();
    await runCli(['projects', 'link', 'p-1']);
    expect(runProjectsLink).toHaveBeenCalled();
    await runCli(['projects', 'changes']);
    expect(runProjectsChanges).toHaveBeenCalled();
    await runCli(['projects', 'clone', 'p-1']);
    expect(runProjectsClone).toHaveBeenCalled();
    await runCli(['projects', 'pull']);
    expect(runProjectsGithubPullCmd).toHaveBeenCalled();
    await runCli(['projects', 'push']);
    expect(runProjectsGithubPushCmd).toHaveBeenCalled();
  });


  it('usage and validation error branches', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // bare parents / bad subs
    await runCli(['config']);
    await runCli(['config', 'nope']);
    await runCli(['data-products']);
    await runCli(['data-products', 'create']);
    await runCli(['data-products', 'promote', 'dp-1']);
    await runCli(['data-products', 'query', 'dp-1']);
    await runCli(['workflows']);
    await runCli(['workflows', 'create', '--name', 'only']);
    await runCli(['workflows', 'deploy']);
    await runCli(['bundle']);
    await runCli(['connectors']);
    await runCli(['connectors', 'capture-samples', 'c-1']);
    await runCli(['triggers']);
    await runCli(['triggers', 'create', '--name', 't']);
    await runCli(['domains']);
    await runCli(['standards']);
    await runCli(['data-contracts']);
    await runCli(['data-contracts', 'create', '--name', 'x']);
    await runCli(['metrics']);
    await runCli(['metrics', 'log', '--id', 'x']);
    await runCli(['queue']);
    await runCli(['queue', 'info']);
    await runCli(['queue', 'checkpoint', 'q-1']);
    await runCli(['transform']);
    await runCli(['transform', 'create']);
    await runCli(['delivery']);
    await runCli(['delivery', 'create', '--from', 'dp']);
    await runCli(['improvements']);
    await runCli(['approvals']);
    await runCli(['cdlc']);
    await runCli(['candidates']);
    await runCli(['candidates', 'act', 'c-1']);
    await runCli(['packs']);
    await runCli(['deployments']);
    await runCli(['activity']);
    await runCli(['instances']);
    await runCli(['instances', 'register']);
    await runCli(['projects']);
    await runCli(['observe']);
    await runCli(['bus']);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('unknown command', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await runCli(['nope-command']);
    expect(printCliHelp).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    err.mockRestore();
  });
});

