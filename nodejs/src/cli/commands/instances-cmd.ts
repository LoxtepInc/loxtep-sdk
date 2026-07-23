/**
 * CLI: loxtep instances list | get <id> | create | deployment-urls | register | registration
 *
 * Wraps the `client.workspace.instances` SDK namespace. Lifecycle: `list` and `get` are
 * read-only; `deployment-urls` + `register` + `registration` drive the
 * self-hosted install flow alongside `create`.
 *
 *   loxtep instances list
 *   loxtep instances get <id>
 *   loxtep instances create \
 *     --name <n> --region <region> --type <shared|managed|self-hosted> \
 *     [--plan-id <starter|pro|enterprise>] \
 *     [--payment-method-id <uuid>] \
 *     [--cross-account-role-arn <arn>] \
 *     [--rstreams-secret-arn <arn>] [--rstreams-auth-arn <arn>] \
 *     [--external-id <ext>]
 *
 * Self-hosted install:
 *   loxtep instances deployment-urls                       # step 1: get one-click URL / CLI / Terraform snippets + external ID
 *   loxtep instances register --cross-account-role-arn <arn> [--region <region>]
 *                                                          # step 2: register the user's role ARN at the org level
 *   loxtep instances registration                          # optional check: read registered ARN + external ID
 */

import { parseInstancesListResponse } from '../../client/instances-list-response.js';
import { toInstanceListSummaries } from '../../client/instance-list-summary.js';
import { createCliHttpClient, requireCliClient } from '../create-cli-client.js';
import type { InstanceCreateInput, InstanceType } from '../../client/instances-types.js';

export interface InstancesCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  /** Print raw GET /organizations/instances JSON to stderr (also enabled with LOXTEP_DEBUG=1). */
  debug?: boolean;
  /** For tests: inject fetch to mock API. */
  fetch_fn?: typeof fetch;
}

function isDebugEnabled(options: InstancesCmdOptions): boolean {
  return options.debug === true || process.env.LOXTEP_DEBUG === '1';
}

export async function runInstancesList(options: InstancesCmdOptions = {}): Promise<void> {
  try {
    const cli = await createCliHttpClient({
      configFilePath: options.configFilePath,
      credentialsPath: options.credentialsPath,
      customerMcpPath: options.customerMcpPath,
      fetch_fn: options.fetch_fn,
    });
    if (!cli) {
      console.error('Missing api_url or access token. Run: pnpm exec loxtep login');
      process.exitCode = 1;
      return;
    }

    const raw = await cli.http.get<unknown>('/organizations/instances');

    if (isDebugEnabled(options)) {
      console.error('[loxtep instances debug] GET /organizations/instances response:');
      console.error(JSON.stringify(raw, null, 2));
    }

    const { items } = parseInstancesListResponse(raw);
    console.log(JSON.stringify(toInstanceListSummaries(items), null, 2));

    if (items.length === 0) {
      console.error(
        'No instances returned. Every org should have at least a default shared instance. Run `LOXTEP_DEBUG=1 loxtep instances list --debug` to inspect the API host and raw response, or `loxtep login` again if the API host is wrong.'
      );
      process.exitCode = 1;
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runInstancesGet(
  instanceId: string,
  options: InstancesCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const instance = await client.workspace.instances.get(instanceId);
    console.log(JSON.stringify(instance, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runInstancesCreate(
  input: InstanceCreateInput,
  options: InstancesCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.workspace.instances.create(input);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runInstancesDeploymentUrls(
  options: InstancesCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    // `client.workspace.instances.get_deployment_urls` resolves the org id from the
    // SDK client config (LOXTEP_ORGANIZATION_ID or ~/.loxtep/credentials.json
    // / workspace config). Throws when the org id is unset.
    const result = await client.workspace.instances.get_deployment_urls();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runInstancesRegistration(
  options: InstancesCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.workspace.instances.get_infrastructure();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runInstancesRegister(
  crossAccountRoleArn: string,
  region: string | undefined,
  options: InstancesCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.workspace.instances.register_infrastructure({
      cross_account_role_arn: crossAccountRoleArn,
      ...(region ? { region } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

// Helper exported for index.ts arg parsing — converts the flat CLI flags into
// the SDK's InstanceCreateInput shape. Throws on invalid combinations.
export function parseCreateInstanceArgs(args: string[]): InstanceCreateInput {
  const getFlag = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const name = getFlag('--name');
  const region = getFlag('--region');
  const type = getFlag('--type') as InstanceType | undefined;
  const planId = getFlag('--plan-id');
  const paymentMethodId = getFlag('--payment-method-id');
  const roleArn = getFlag('--cross-account-role-arn');
  const secretArn = getFlag('--rstreams-secret-arn');
  const authArn = getFlag('--rstreams-auth-arn');
  const externalId = getFlag('--external-id');

  if (!name || !region || !type) {
    throw new Error(
      'Usage: loxtep instances create --name <n> --region <region> --type <shared|managed|self-hosted> [--plan-id <id>] [--payment-method-id <uuid>] [--cross-account-role-arn <arn> --rstreams-secret-arn <arn> --rstreams-auth-arn <arn>] [--external-id <ext>]'
    );
  }
  if (!['shared', 'managed', 'self-hosted'].includes(type)) {
    throw new Error(
      `--type must be one of shared | managed | self-hosted (got "${type}")`
    );
  }
  if (type === 'managed' && !planId) {
    throw new Error('--plan-id is required for managed instances (starter | pro | enterprise)');
  }
  if ((type === 'managed' || type === 'self-hosted') && !paymentMethodId) {
    throw new Error('--payment-method-id is required for managed and self-hosted instances');
  }
  if (type === 'self-hosted') {
    if (!roleArn || !secretArn || !authArn) {
      throw new Error(
        'self-hosted requires --cross-account-role-arn, --rstreams-secret-arn, and --rstreams-auth-arn'
      );
    }
  }

  return {
    name,
    region,
    instance_type: type,
    ...(planId ? { plan_id: planId } : {}),
    ...(paymentMethodId ? { payment_method_id: paymentMethodId } : {}),
    ...((roleArn || secretArn || authArn)
      ? {
          connection_details: {
            observe_api: {
              ...(roleArn ? { cross_account_role_arn: roleArn } : {}),
              ...(secretArn ? { rstreams_secret_arn: secretArn } : {}),
              ...(authArn ? { rstreams_auth_arn: authArn } : {}),
              ...(externalId ? { external_id: externalId } : {}),
            },
          },
        }
      : {}),
  };
}