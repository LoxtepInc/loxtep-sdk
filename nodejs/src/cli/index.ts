#!/usr/bin/env node
/**
 * Loxtep CLI — the Enterprise Context Layer.
 * Turns organizational knowledge, expertise, and norms into machine-usable
 * context for AI across heterogeneous systems.
 *
 * Usage: loxtep <command> [options]
 * Commands: login, logout, whoami, init, attach, config, bus, data-products, queue, workflows, observe, triggers, domains, standards, data-contracts
 */

import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runWhoami } from './commands/whoami.js';
import { runAttach } from './commands/attach-cmd.js';
import {
  runConfigList,
  runConfigPaths,
  runConfigSet,
  runConfigExportFromDataProduct,
  runConfigExportFromConnector,
} from './commands/config-cmd.js';
import { runInitCommand } from './commands/init-cmd.js';
import { runBusLogin } from './commands/bus-cmd.js';
import { createCliClient } from './create-cli-client.js';
import {
  runDataProductsList,
  runDataProductsGet,
  runDataProductsQuery,
  runDataProductsTables,
  runDataProductsCreate,
  runDataProductsReadiness,
  runDataProductsPromote,
} from './commands/data-products-cmd.js';
import { runMetricsRateLimits, runMetricsLog } from './commands/metrics-cmd.js';
import { runQueueInfo, runQueueCheckpoint } from './commands/queue-cmd.js';
import {
  runWorkflowsList,
  runWorkflowsGet,
  runWorkflowsCreate,
  runWorkflowsDeploy,
} from './commands/workflows-cmd.js';
import { runObserveStatus } from './commands/observe-cmd.js';
import {
  runTriggersList,
  runTriggersGet,
  runTriggersCreate,
  runTriggersTest,
} from './commands/triggers-cmd.js';
import { runDomainsList, runDomainsGet } from './commands/domains-cmd.js';
import { runStandardsList, runStandardsGet } from './commands/standards-cmd.js';
import { runDataContractsList, runDataContractsGet, runDataContractsCreate } from './commands/data-contracts-cmd.js';
import { runGenerate } from './commands/generate-cmd.js';
import { runTest } from './commands/test-cmd.js';
import { runDeploy } from './commands/deploy-cmd.js';
import {
  runImprovementsListCommand,
  runImprovementsApplyCommand,
  runImprovementsRejectCommand,
} from './commands/improvements-cmd.js';
import { runActivityListCommand } from './commands/activity-cmd.js';
import {
  runInstancesList,
  runInstancesGet,
  runInstancesCreate,
  runInstancesDeploymentUrls,
  runInstancesRegistration,
  runInstancesRegister,
  parseCreateInstanceArgs,
} from './commands/instances-cmd.js';

const args = process.argv.slice(2);
const command = args[0];
const sub = args[1];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function printHelp(): void {
  console.log(`
Loxtep — the Enterprise Context Layer.
Turns organizational knowledge, expertise, and norms into machine-usable context for AI.

Usage: loxtep <command> [options]

Commands:
  login              Log in (opens browser by default). Use --console for terminal email/password/TOTP login.
  logout             Remove stored credentials
  whoami             Print current user and organization
  init               Print setup checklist (config + auth + docs pointers)
  attach [--instance <id>]  Link project to an Instance (writes instance_id + api_url)
  generate           Generate typed workspace context artifact (.loxtep/generated/index.ts)
  test <module> --event <file>  Execute a workflow module locally with a sample event (prints action trace)
  deploy             Compile and deploy workflow modules to the attached Instance
  config list        Show current config (api_url, organization_id, project_id, instance_id)
  config paths       Show resolved URLs for auth and a full matrix of LoxtepClient SDK paths → gateway URLs
  config set <k> <v> Set config key (api_url | auth_path_prefix | api_path_prefix | organization_id | …)
  config export --from-connector <id> [--format sh|json|env]  Print env exports from SDK connector
  config export --from-data-product <id> [--format sh|json|env]  Print env exports for SDK/bootstrap
  bus login          Explain bus vs JWT; placeholder for future RBAC bus session
  data-products list   List data products
  data-products get <id> Get data product by id
  data-products create --name <n> --domain-id <uuid> [--description <text>]  Create data product
  data-products query <id> <SQL>   Run SQL in data product context (or --file query.sql)
  data-products tables <id> List tables for data product
  data-products readiness <id>  Check promotion readiness (prerequisites + progress)
  data-products promote <id> --target <silver|gold>  Execute medallion tier promotion
  metrics rate-limits Show rate limit info from last response or /rate-limits
  metrics log        Log metric (--id <id> --value <n> [--tags k=v,...])
  queue info <id>    Queue info by data product id
  queue info --queue <name> Queue info by queue name
  queue checkpoint <id> --bot <bot-id> Reader checkpoint for data product and bot
  workflows list     List workflows (requires --project-id or config project_id)
  workflows get <id> Get workflow by id (with nodes)
  workflows create   Create workflow (--name, --project-id required; --template-id, --description optional)
  workflows deploy   Deploy workflow (--project-id required; --instance-id, --version-id, --force optional)
  triggers list      List triggers (ingest source bindings)
  triggers get <id>  Get trigger by id
  triggers create    Create trigger (--name, --type, --key required)
  triggers test <id> Test trigger
  domains list       List domains
  domains get <id>   Get domain by id
  standards list      List standards (policies)
  standards get <id>  Get standard by id
  data-contracts list      List data contracts
  data-contracts get <id>  Get data contract by id
  data-contracts create --data-product-id <id> --name <name> [--description <text>]  Create data contract
  improvements list [--status <s>] [--workflow <name>]  List improvements
  improvements apply <id>  Apply proposed change to workflow module file
  improvements reject <id> Reject an improvement
  activity list [--source <s>] [--actor <a>] [--resource-type <t>] [--from <date>] [--to <date>]  List activity/audit entries
  instances list                                List Loxtep instances in this organization
  instances get <id>                            Get instance by id
  instances create --name <n> --region <region> --type <shared|managed|self-hosted>
                                                Create an instance (managed: also pass --plan-id + --payment-method-id;
                                                  self-hosted: also pass --payment-method-id + --cross-account-role-arn
                                                  + --rstreams-secret-arn + --rstreams-auth-arn [--external-id <ext>])
  instances deployment-urls                    Step 1 of self-hosted install: print one-click URL + CLI / Terraform snippets + external ID
                                                  (LOXTEP_ORGANIZATION_ID must be set, or use --org-id)
  instances register --cross-account-role-arn <arn> [--region <region>]
                                                Step 2 of self-hosted install: register the user's role ARN at the org level
                                                  (required before creating a self-hosted instance)
  instances registration                       Optional check: print the registered role ARN + external ID

Examples:
  loxtep login
  loxtep login --console
  loxtep login --console --email you@ex.com --password '…' --mfa-code 123456
  loxtep whoami
  loxtep data-products list
  loxtep workflows list --project-id <project-id>
  loxtep workflows get <workflow-id>
  loxtep workflows create --name "my-workflow" --project-id <project-id> --template-id <template-id>
  loxtep workflows deploy --project-id <id> [--instance-id <id>]  (instance_id defaults from config)
  loxtep triggers list
  loxtep config export --from-connector <connector-id> --format json
  loxtep config export --from-data-product <data-product-id>
  loxtep observe status
  loxtep connections list
  loxtep connections get <connection-id>
  loxtep queue info <data-product-id>
  loxtep queue checkpoint <data-product-id> --bot <bot-id>
  loxtep data-products query <data-product-id> "SELECT * FROM t LIMIT 10"
  loxtep data-products tables <data-product-id>
  loxtep metrics rate-limits
`);
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'login': {
      const emailIdx = args.indexOf('--email');
      const passwordIdx = args.indexOf('--password');
      const mfaIdx = args.indexOf('--mfa-code');
      const orgIdx = args.indexOf('--organization-id');
      await runLogin({
        console: args.includes('--console'),
        email: emailIdx >= 0 ? args[emailIdx + 1] : undefined,
        password: passwordIdx >= 0 ? args[passwordIdx + 1] : undefined,
        mfa_code: mfaIdx >= 0 ? args[mfaIdx + 1] : undefined,
        organization_id: orgIdx >= 0 ? args[orgIdx + 1] : undefined,
      });
      break;
    }
    case 'logout':
      await runLogout();
      break;
    case 'whoami':
      await runWhoami();
      break;
    case 'init': {
      const templateIdx = args.indexOf('--template');
      const templateSlug = templateIdx >= 0 ? args[templateIdx + 1] : undefined;
      const createRepoIdx = args.indexOf('--create-repo');
      const createRepo = createRepoIdx >= 0 ? (args[createRepoIdx + 1] || true) : undefined;
      const fromRepoIdx = args.indexOf('--from-repo');
      const fromRepo = fromRepoIdx >= 0 ? args[fromRepoIdx + 1] : undefined;
      const nameIdx = args.indexOf('--name');
      const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;

      // Attempt to get an authenticated client (don't fail if not logged in)
      const clientResult = await createCliClient().catch(() => null);
      const client = clientResult?.client ?? null;

      const result = await runInitCommand({
        cwd: process.cwd(),
        templateSlug,
        createRepo,
        fromRepo,
        name,
        client,
      });

      for (const line of result.stdout) console.log(line);
      for (const line of result.stderr) console.error(line);
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
      break;
    }
    case 'generate':
      await runGenerate();
      break;
    case 'test':
      await runTest();
      break;
    case 'deploy':
      await runDeploy();
      break;
    case 'attach': {
      const { requireCliClient } = await import('./create-cli-client.js');
      const authResult = await requireCliClient();
      const attachResult = await runAttach(authResult.client, {
        instanceId: getArg('--instance'),
      });
      if (attachResult.stdout.length > 0) {
        attachResult.stdout.forEach(line => console.log(line));
      }
      if (attachResult.stderr.length > 0) {
        attachResult.stderr.forEach(line => console.error(line));
      }
      if (attachResult.exitCode !== 0) {
        process.exitCode = attachResult.exitCode;
      }
      break;
    }
    case 'bus':
      if (sub === 'login') {
        await runBusLogin();
      } else {
        console.error('Usage: loxtep bus login');
        process.exitCode = 1;
      }
      break;
    case 'config':
      if (sub === 'list') {
        await runConfigList();
      } else if (sub === 'paths') {
        await runConfigPaths();
      } else if (sub === 'set' && args[2] != null) {
        await runConfigSet(args[2], args[3] ?? '');
      } else if (sub === 'export') {
        const fromDpIdx = args.indexOf('--from-data-product');
        const dpId = fromDpIdx >= 0 ? args[fromDpIdx + 1] : undefined;
        const fromConnIdx = args.indexOf('--from-connector');
        const connId = fromConnIdx >= 0 ? args[fromConnIdx + 1] : undefined;
        const fmtArg = getArg('--format');
        const format =
          fmtArg === 'json' ? 'json' : fmtArg === 'env' ? 'env' : ('sh' as 'sh' | 'json' | 'env');
        if (connId) {
          await runConfigExportFromConnector(connId, { format });
        } else if (dpId) {
          await runConfigExportFromDataProduct(dpId, { format });
        } else {
          console.error(
            'Usage: loxtep config export --from-connector <id> [--format sh|json|env]\n       loxtep config export --from-data-product <id> [--format sh|json|env]'
          );
          process.exitCode = 1;
        }
      } else {
        console.error(
          'Usage: loxtep config list | loxtep config paths | loxtep config set <key> <value> | loxtep config export --from-connector <id> | loxtep config export --from-data-product <id>'
        );
        process.exitCode = 1;
      }
      break;
    case 'data-products':
      if (sub === 'list') {
        await runDataProductsList();
      } else if (sub === 'get' && args[2]) {
        await runDataProductsGet(args[2]);
      } else if (sub === 'query' && args[2]) {
        const fileIdx = args.indexOf('--file');
        const sql =
          fileIdx >= 0
            ? undefined
            : args
                .slice(3)
                .join(' ')
                .replace(/^["']|["']$/g, '');
        if (fileIdx >= 0) {
          const fs = await import('fs/promises');
          const path = args[fileIdx + 1];
          if (!path) {
            console.error('Usage: loxtep data-products query <id> --file <path>');
            process.exitCode = 1;
          } else {
            const sqlFromFile = (await fs.readFile(path, 'utf-8')).trim();
            await runDataProductsQuery(args[2], sqlFromFile);
          }
        } else if (sql) {
          await runDataProductsQuery(args[2], sql);
        } else {
          console.error(
            'Usage: loxtep data-products query <id> "SQL" | loxtep data-products query <id> --file <path>'
          );
          process.exitCode = 1;
        }
      } else if (sub === 'tables' && args[2]) {
        await runDataProductsTables(args[2]);
      } else if (sub === 'create') {
        const name = getArg('--name');
        const domainId = getArg('--domain-id');
        const kind = getArg('--kind') as 'source' | 'consumer' | undefined;
        const description = getArg('--description');
        if (!name || !domainId || !kind || !['source', 'consumer'].includes(kind)) {
          console.error(
            'Usage: loxtep data-products create --name <name> --domain-id <uuid> --kind <source|consumer> [--description <text>]'
          );
          process.exitCode = 1;
        } else {
          await runDataProductsCreate({ name, domain_id: domainId, kind, description });
        }
      } else if (sub === 'readiness' && args[2]) {
        await runDataProductsReadiness(args[2]);
      } else if (sub === 'promote' && args[2]) {
        const target = getArg('--target') as 'silver' | 'gold' | undefined;
        if (!target || !['silver', 'gold'].includes(target)) {
          console.error('Usage: loxtep data-products promote <id> --target <silver|gold>');
          process.exitCode = 1;
        } else {
          await runDataProductsPromote(args[2], target);
        }
      } else {
        console.error(
          'Usage: loxtep data-products list | get <id> | create --name ... --domain-id ... | query <id> "SQL" | tables <id>'
        );
        process.exitCode = 1;
      }
      break;
    case 'metrics':
      if (sub === 'rate-limits') {
        await runMetricsRateLimits();
      } else if (sub === 'log') {
        const id = getArg('--id');
        const valueStr = getArg('--value');
        const value = valueStr != null ? Number(valueStr) : NaN;
        if (!id || Number.isNaN(value)) {
          console.error('Usage: loxtep metrics log --id <id> --value <number> [--tags k=v,...]');
          process.exitCode = 1;
        } else {
          await runMetricsLog({ id, value });
        }
      } else {
        console.error(
          'Usage: loxtep metrics rate-limits | loxtep metrics log --id <id> --value <n>'
        );
        process.exitCode = 1;
      }
      break;
    case 'queue':
      if (sub === 'info') {
        const queueIdx = args.indexOf('--queue');
        const idOrName = queueIdx >= 0 ? args[queueIdx + 1] : args[2];
        if (!idOrName) {
          console.error(
            'Usage: loxtep queue info <data-product-id> | loxtep queue info --queue <queue-name>'
          );
          process.exitCode = 1;
        } else {
          await runQueueInfo(idOrName, { queueName: queueIdx >= 0 });
        }
      } else if (sub === 'checkpoint' && args[2]) {
        const botIdx = args.indexOf('--bot');
        const botId = botIdx >= 0 ? args[botIdx + 1] : undefined;
        if (!botId) {
          console.error('Usage: loxtep queue checkpoint <data-product-id> --bot <bot-id>');
          process.exitCode = 1;
        } else {
          await runQueueCheckpoint(args[2], botId);
        }
      } else {
        console.error(
          'Usage: loxtep queue info <id> | loxtep queue checkpoint <id> --bot <bot-id>'
        );
        process.exitCode = 1;
      }
      break;
    case 'workflows':
      if (sub === 'list') {
        await runWorkflowsList({ project_id: getArg('--project-id') });
      } else if (sub === 'get' && args[2]) {
        await runWorkflowsGet(args[2]);
      } else if (sub === 'create') {
        const name = getArg('--name');
        const projectId = getArg('--project-id');
        const templateId = getArg('--template-id');
        const description = getArg('--description');
        if (!name || !projectId) {
          console.error(
            'Usage: loxtep workflows create --name <name> --project-id <id> [--template-id <id>] [--description <text>]'
          );
          process.exitCode = 1;
        } else {
          await runWorkflowsCreate({
            name,
            project_id: projectId,
            template_id: templateId,
            description,
          });
        }
      } else if (sub === 'deploy') {
        const projectId = getArg('--project-id');
        const instanceId = getArg('--instance-id');
        const versionId = getArg('--version-id');
        const force = args.includes('--force');
        if (!projectId) {
          console.error(
            'Usage: loxtep workflows deploy --project-id <id> [--instance-id <id>] [--version-id <id>] [--force]'
          );
          process.exitCode = 1;
        } else {
          await runWorkflowsDeploy({
            project_id: projectId,
            instance_id: instanceId,
            version_id: versionId,
            force_redeploy: force,
          });
        }
      } else {
        console.error(
          'Usage: loxtep workflows list [--project-id <id>] | get <id> | create --name <name> --project-id <id> | deploy --project-id <id> --instance-id <id>'
        );
        process.exitCode = 1;
      }
      break;
    case 'observe':
      if (sub === 'status') {
        await runObserveStatus();
      } else {
        console.error('Usage: loxtep observe status');
        process.exitCode = 1;
      }
      break;
    case 'triggers':
      if (sub === 'list') {
        await runTriggersList();
      } else if (sub === 'get' && args[2]) {
        await runTriggersGet(args[2]);
      } else if (sub === 'create') {
        const name = getArg('--name');
        const type = getArg('--type');
        const key = getArg('--key');
        const data = getArg('--data');
        if (!name || !type || !key) {
          console.error(
            'Usage: loxtep triggers create --name <name> --type <database|api|webhook|file> --key <key> [--data <json>]'
          );
          process.exitCode = 1;
        } else {
          await runTriggersCreate({
            name,
            type,
            key,
            data: data ?? '{}',
          });
        }
      } else if (sub === 'test' && args[2]) {
        await runTriggersTest(args[2]);
      } else {
        console.error(
          'Usage: loxtep triggers list | get <id> | create --name <name> --type <type> --key <key> | test <id>'
        );
        process.exitCode = 1;
      }
      break;
    case 'domains':
      if (sub === 'list') {
        await runDomainsList();
      } else if (sub === 'get' && args[2]) {
        await runDomainsGet(args[2]);
      } else {
        console.error('Usage: loxtep domains list | loxtep domains get <id>');
        process.exitCode = 1;
      }
      break;
    case 'standards':
      if (sub === 'list') {
        await runStandardsList();
      } else if (sub === 'get' && args[2]) {
        await runStandardsGet(args[2]);
      } else {
        console.error('Usage: loxtep standards list | loxtep standards get <id>');
        process.exitCode = 1;
      }
      break;
    case 'data-contracts':
      if (sub === 'list') {
        await runDataContractsList();
      } else if (sub === 'get' && args[2]) {
        await runDataContractsGet(args[2]);
      } else if (sub === 'create') {
        const dpId = getArg('--data-product-id');
        const name = getArg('--name');
        if (!dpId || !name) {
          console.error(
            'Usage: loxtep data-contracts create --data-product-id <id> --name <name> [--description <text>]'
          );
          process.exitCode = 1;
        } else {
          await runDataContractsCreate({
            data_product_id: dpId,
            name,
            description: getArg('--description'),
          });
        }
      } else {
        console.error(
          'Usage: loxtep data-contracts list | get <id> | create --data-product-id <id> --name <name>'
        );
        process.exitCode = 1;
      }
      break;
    case 'promises':
      console.warn('Warning: "promises" is deprecated; use "data-contracts" (same behavior).');
      if (sub === 'list') {
        await runDataContractsList();
      } else if (sub === 'get' && args[2]) {
        await runDataContractsGet(args[2]);
      } else {
        console.error('Usage: loxtep data-contracts list | loxtep data-contracts get <id>');
        process.exitCode = 1;
      }
      break;
    case 'improvements': {
      const { requireCliClient: requireAuth } = await import('./create-cli-client.js');
      const authResult = await requireAuth();
      if (sub === 'list') {
        const statusFilter = getArg('--status');
        const workflowFilter = getArg('--workflow');
        const result = await runImprovementsListCommand(authResult.client, {
          status: statusFilter,
          workflow_name: workflowFilter,
        });
        for (const line of result.stdout) console.log(line);
        for (const line of result.stderr) console.error(line);
        if (result.exitCode !== 0) process.exitCode = result.exitCode;
      } else if (sub === 'apply' && args[2]) {
        const result = await runImprovementsApplyCommand(authResult.client, args[2]);
        for (const line of result.stdout) console.log(line);
        for (const line of result.stderr) console.error(line);
        if (result.exitCode !== 0) process.exitCode = result.exitCode;
      } else if (sub === 'reject' && args[2]) {
        const result = await runImprovementsRejectCommand(authResult.client, args[2]);
        for (const line of result.stdout) console.log(line);
        for (const line of result.stderr) console.error(line);
        if (result.exitCode !== 0) process.exitCode = result.exitCode;
      } else {
        console.error(
          'Usage: loxtep improvements list [--status proposed|applied|rejected] [--workflow <name>]\n' +
          '       loxtep improvements apply <id>\n' +
          '       loxtep improvements reject <id>'
        );
        process.exitCode = 1;
      }
      break;
    }
    case 'activity': {
      const { requireCliClient: requireAuth } = await import('./create-cli-client.js');
      const authResult = await requireAuth();
      if (sub === 'list') {
        const sourceFilter = getArg('--source');
        const actorFilter = getArg('--actor');
        const resourceTypeFilter = getArg('--resource-type');
        const fromFilter = getArg('--from');
        const toFilter = getArg('--to');
        const limitStr = getArg('--limit');
        const limit = limitStr != null ? parseInt(limitStr, 10) : undefined;
        const result = await runActivityListCommand(authResult.client, {
          source: sourceFilter,
          actor: actorFilter,
          resource_type: resourceTypeFilter,
          from: fromFilter,
          to: toFilter,
          limit: limit != null && !Number.isNaN(limit) ? limit : undefined,
        });
        for (const line of result.stdout) console.log(line);
        for (const line of result.stderr) console.error(line);
        if (result.exitCode !== 0) process.exitCode = result.exitCode;
      } else {
        console.error(
          'Usage: loxtep activity list [--source cli|sdk|mcp|ui] [--actor <id>] [--resource-type <type>] [--from <date>] [--to <date>] [--limit <n>]'
        );
        process.exitCode = 1;
      }
      break;
    }
    case 'instances': {
      if (sub === 'list') {
        await runInstancesList();
      } else if (sub === 'get' && args[2]) {
        await runInstancesGet(args[2]);
      } else if (sub === 'create') {
        try {
          const input = parseCreateInstanceArgs(args.slice(2));
          await runInstancesCreate(input);
        } catch (err) {
          console.error((err as Error).message);
          process.exitCode = 1;
        }
      } else if (sub === 'deployment-urls') {
        await runInstancesDeploymentUrls();
      } else if (sub === 'register') {
        const roleArn = getArg('--cross-account-role-arn');
        const region = getArg('--region');
        if (!roleArn) {
          console.error(
            'Usage: loxtep instances register --cross-account-role-arn <arn> [--region <region>]'
          );
          process.exitCode = 1;
        } else {
          await runInstancesRegister(roleArn, region);
        }
      } else if (sub === 'registration') {
        await runInstancesRegistration();
      } else {
        console.error(
          'Usage: loxtep instances list | get <id> | create --name ... --region ... --type ... | deployment-urls | register --cross-account-role-arn <arn> | registration'
        );
        process.exitCode = 1;
      }
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
