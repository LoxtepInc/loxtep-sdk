/**
 * CLI: loxtep bots register | list | get | update | deregister | reconcile
 *
 * BYOL custom Lambda → LeoCron registration on a dedicated instance.
 */

import { requireCliClient } from '../create-cli-client.js';
import type {
  CustomBotRegisterInput,
  CustomBotUpdateInput,
} from '../../client/custom-bots.js';

export interface BotsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

function requireInstanceId(
  explicit: string | undefined,
  attached: string | undefined,
): string {
  const id = explicit?.trim() || attached?.trim();
  if (!id) {
    throw new Error(
      'Missing instance id. Pass --instance <uuid> or run `loxtep attach` / set LOXTEP_INSTANCE_ID.',
    );
  }
  return id;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function runBotsList(
  instanceIdFlag: string | undefined,
  options: BotsCmdOptions = {},
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const instanceId = requireInstanceId(instanceIdFlag, client.instance_id);
    printJson(await client.workspace.custom_bots.list(instanceId));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runBotsGet(
  instanceIdFlag: string | undefined,
  botId: string,
  options: BotsCmdOptions = {},
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const instanceId = requireInstanceId(instanceIdFlag, client.instance_id);
    printJson(await client.workspace.custom_bots.get(instanceId, botId));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runBotsRegister(
  instanceIdFlag: string | undefined,
  input: CustomBotRegisterInput,
  options: BotsCmdOptions = {},
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const instanceId = requireInstanceId(instanceIdFlag, client.instance_id);
    const result = await client.workspace.custom_bots.register(instanceId, input);
    printJson(result);
    console.error(
      '\nNext: attach iam_policy to the Lambda role, set RSTREAMS_CONFIG_SECRET / LEOAUTH_CONFIG_SECRET, then unpause in Observe.',
    );
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runBotsUpdate(
  instanceIdFlag: string | undefined,
  botId: string,
  input: CustomBotUpdateInput,
  options: BotsCmdOptions = {},
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const instanceId = requireInstanceId(instanceIdFlag, client.instance_id);
    printJson(await client.workspace.custom_bots.update(instanceId, botId, input));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runBotsDeregister(
  instanceIdFlag: string | undefined,
  botId: string,
  options: BotsCmdOptions = {},
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const instanceId = requireInstanceId(instanceIdFlag, client.instance_id);
    printJson(await client.workspace.custom_bots.deregister(instanceId, botId));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runBotsReconcile(
  instanceIdFlag: string | undefined,
  options: BotsCmdOptions = {},
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const instanceId = requireInstanceId(instanceIdFlag, client.instance_id);
    printJson(await client.workspace.custom_bots.reconcile(instanceId));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
