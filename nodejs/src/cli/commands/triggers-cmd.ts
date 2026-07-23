/**
 * CLI: loxtep triggers list | triggers get <id> | triggers create ... | triggers test <id>
 */

import { requireCliClient } from '../create-cli-client.js';

export interface TriggersCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runTriggersList(options: TriggersCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.build.triggers.list({ page_size: 50 });
  console.log(JSON.stringify(result, null, 2));
}

export async function runTriggersGet(
  triggerId: string,
  options: TriggersCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const trigger = await client.build.triggers.get(triggerId);
  console.log(JSON.stringify(trigger, null, 2));
}

export async function runTriggersCreate(
  params: {
    name?: string;
    type?: string;
    key?: string;
    data?: string;
    configuration?: Record<string, unknown>;
  },
  options: TriggersCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const name = params.name ?? '';
  const type = params.type ?? 'api';
  const key = params.key ?? params.name ?? '';
  if (!name || !key) {
    console.error('Missing required: --name, --type, --key');
    process.exitCode = 1;
    return;
  }
  const trigger = await client.build.triggers.create({
    name,
    type: type as 'database' | 'api' | 'webhook' | 'file',
    key,
    data: params.data ?? '{}',
    configuration: params.configuration,
  });
  console.log(JSON.stringify(trigger, null, 2));
}

export async function runTriggersTest(
  triggerId: string,
  options: TriggersCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await client.build.triggers.test(triggerId);
  console.log(JSON.stringify(result, null, 2));
}
