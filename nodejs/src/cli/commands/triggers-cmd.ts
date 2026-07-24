/**
 * CLI: loxtep triggers list | triggers get <id> | triggers create ... | triggers test <id>
 */

import { toTriggerListSummary } from '../../client/list-summaries.js';
import { mapListSummaries, printCliListOutput } from '../cli-list-output.js';
import { requireCliClient } from '../create-cli-client.js';

export interface TriggersCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
  project_id?: string;
  workflow_id?: string;
}

export async function runTriggersList(options: TriggersCmdOptions = {}): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const projectId = options.project_id ?? config.project_id;
  if (!projectId) {
    console.error(
      'Missing project_id. Run from a workspace after `loxtep init`, or pass --project-id <uuid>.'
    );
    process.exitCode = 1;
    return;
  }
  const result = await client.build.triggers.list({
    project_id: projectId,
    workflow_id: options.workflow_id,
    page_size: 50,
  });
  const summary = mapListSummaries(result, toTriggerListSummary);
  printCliListOutput(summary, result, { ...options, label: 'triggers list' });
}

export async function runTriggersGet(
  triggerId: string,
  options: TriggersCmdOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const projectId = options.project_id ?? config.project_id;
  if (!projectId) {
    console.error('Missing project_id. Pass --project-id <uuid>.');
    process.exitCode = 1;
    return;
  }
  const trigger = await client.build.triggers.get(triggerId, {
    project_id: projectId,
    workflow_id: options.workflow_id,
  });
  console.log(JSON.stringify(trigger, null, 2));
}

export async function runTriggersCreate(
  params: {
    name?: string;
    type?: string;
    key?: string;
    data?: string;
    configuration?: Record<string, unknown>;
    project_id?: string;
    workflow_id?: string;
  },
  options: TriggersCmdOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const projectId = params.project_id ?? options.project_id ?? config.project_id;
  const workflowId = params.workflow_id ?? options.workflow_id;
  const name = params.name ?? '';
  const type = params.type ?? 'api';
  const key = params.key ?? params.name ?? '';
  if (!projectId || !workflowId || !name || !key) {
    console.error(
      'Missing required: --project-id, --workflow-id, --name, --key (prefer: loxtep ingest create)'
    );
    process.exitCode = 1;
    return;
  }
  const trigger = await client.build.triggers.create({
    project_id: projectId,
    workflow_id: workflowId,
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
  const { client, config } = await requireCliClient(options);
  const projectId = options.project_id ?? config.project_id;
  if (!projectId) {
    console.error('Missing project_id. Pass --project-id <uuid>.');
    process.exitCode = 1;
    return;
  }
  const result = await client.build.triggers.test(triggerId, {
    project_id: projectId,
    workflow_id: options.workflow_id,
  });
  console.log(JSON.stringify(result, null, 2));
}
