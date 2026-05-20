#!/usr/bin/env node
/**
 * Loxtep CLI entry point.
 * Usage: loxtep <command> [options]
 * Commands: login, logout, whoami, init, config, bus, data-products, queue, flows, workflows, observe, connections, domains, standards, data-contracts
 */

import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runWhoami } from './commands/whoami.js';
import {
  runConfigList,
  runConfigPaths,
  runConfigSet,
  runConfigExportFromDataProduct,
  runConfigExportFromConnector,
  runInit,
} from './commands/config-cmd.js';
import { runBusLogin } from './commands/bus-cmd.js';
import {
  runDataProductsList,
  runDataProductsGet,
  runDataProductsQuery,
  runDataProductsTables,
  runDataProductsCreate,
} from './commands/data-products-cmd.js';
import { runMetricsRateLimits, runMetricsLog } from './commands/metrics-cmd.js';
import { runQueueInfo, runQueueCheckpoint } from './commands/queue-cmd.js';
import { runFlowsList, runFlowsGet, runFlowsCreate } from './commands/flows-cmd.js';
import { runWorkflowsList, runWorkflowsDeploy } from './commands/workflows-cmd.js';
import { runObserveStatus } from './commands/observe-cmd.js';
import {
  runConnectionsList,
  runConnectionsGet,
  runConnectionsCreate,
  runConnectionsTest,
} from './commands/connections-cmd.js';
import { runDomainsList, runDomainsGet } from './commands/domains-cmd.js';
import { runStandardsList, runStandardsGet } from './commands/standards-cmd.js';
import { runDataContractsList, runDataContractsGet } from './commands/data-contracts-cmd.js';

const args = process.argv.slice(2);
const command = args[0];
const sub = args[1];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function printHelp(): void {
  console.log(`
Usage: loxtep <command> [options]

Commands:
  login              Log in (email, password, then optional 6-digit TOTP in one request). Use --mfa-code for scripts. Or login --browser
  logout             Remove stored credentials
  whoami             Print current user and organization
  init               Print setup checklist (config + auth + docs pointers)
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
  metrics rate-limits Show rate limit info from last response or /rate-limits
  metrics log        Log metric (--id <id> --value <n> [--tags k=v,...])
  queue info <id>    Queue info by data product id
  queue info --queue <name> Queue info by queue name
  queue checkpoint <id> --bot <bot-id> Reader checkpoint for data product and bot
  flows list         List flows (requires --project-id or config project_id)
  flows get <id>     Get flow by id (with nodes)
  flows create       Create flow (--name, --project-id required; --template-id, --description optional)
  connections list   List connections
  connections get <id> Get connection by id
  connections create Create connection (--name, --type, --key required)
  connections test <id> Test connection
  domains list       List domains
  domains get <id>   Get domain by id
  standards list      List standards (policies)
  standards get <id>  Get standard by id
  data-contracts list      List data contracts
  data-contracts get <id>  Get data contract by id

Examples:
  loxtep login
  loxtep login --email you@ex.com --password '…' --mfa-code 123456
  loxtep login --browser
  loxtep whoami
  loxtep data-products list
  loxtep flows list --project-id <project-id>
  loxtep flows get <flow-id>
  loxtep flows create --name "my-flow" --project-id <project-id> --template-id <template-id>
  loxtep workflows list --project-id <project-id>
  loxtep workflows deploy --project-id <id> [--instance-id <id>]  (instance_id defaults from config)
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
        browser: args.includes('--browser'),
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
    case 'init':
      await runInit();
      break;
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
        const description = getArg('--description');
        if (!name || !domainId) {
          console.error(
            'Usage: loxtep data-products create --name <name> --domain-id <uuid> [--description <text>]'
          );
          process.exitCode = 1;
        } else {
          await runDataProductsCreate({ name, domain_id: domainId, description });
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
    case 'flows':
      if (sub === 'list') {
        await runFlowsList({ project_id: getArg('--project-id') });
      } else if (sub === 'get' && args[2]) {
        await runFlowsGet(args[2]);
      } else if (sub === 'create') {
        const name = getArg('--name');
        const projectId = getArg('--project-id');
        const templateId = getArg('--template-id');
        const description = getArg('--description');
        if (!name || !projectId) {
          console.error(
            'Usage: loxtep flows create --name <name> --project-id <id> [--template-id <id>] [--description <text>]'
          );
          process.exitCode = 1;
        } else {
          await runFlowsCreate({
            name,
            project_id: projectId,
            template_id: templateId,
            description,
          });
        }
      } else {
        console.error(
          'Usage: loxtep flows list [--project-id <id>] | loxtep flows get <id> | loxtep flows create --name <name> --project-id <id>'
        );
        process.exitCode = 1;
      }
      break;
    case 'workflows':
      if (sub === 'list') {
        await runWorkflowsList({ project_id: getArg('--project-id') });
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
          'Usage: loxtep workflows list [--project-id <id>] | loxtep workflows deploy --project-id <id> --instance-id <id>'
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
    case 'connections':
      if (sub === 'list') {
        await runConnectionsList();
      } else if (sub === 'get' && args[2]) {
        await runConnectionsGet(args[2]);
      } else if (sub === 'create') {
        const name = getArg('--name');
        const type = getArg('--type');
        const key = getArg('--key');
        const data = getArg('--data');
        if (!name || !type || !key) {
          console.error(
            'Usage: loxtep connections create --name <name> --type <database|api|webhook|file> --key <key> [--data <json>]'
          );
          process.exitCode = 1;
        } else {
          await runConnectionsCreate({
            name,
            type,
            key,
            data: data ?? '{}',
          });
        }
      } else if (sub === 'test' && args[2]) {
        await runConnectionsTest(args[2]);
      } else {
        console.error(
          'Usage: loxtep connections list | get <id> | create --name <name> --type <type> --key <key> | test <id>'
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
      } else {
        console.error('Usage: loxtep data-contracts list | loxtep data-contracts get <id>');
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
