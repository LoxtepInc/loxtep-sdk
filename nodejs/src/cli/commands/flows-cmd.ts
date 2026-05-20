/**
 * CLI: loxtep flows list --project-id <id> | flows get <id> | flows create ...
 */

import { requireCliClient } from '../create-cli-client.js';

export interface FlowsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runFlowsList(
  options: FlowsCmdOptions & { project_id?: string } = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const projectId = options.project_id ?? config.project_id;
  if (!projectId) {
    console.error(
      'Missing project_id. Use: loxtep flows list --project-id <id> or loxtep config set project_id <id>'
    );
    process.exitCode = 1;
    return;
  }
  const result = await client.flows.list({ project_id: projectId, page_size: 50 });
  console.log(JSON.stringify(result, null, 2));
}

export async function runFlowsGet(flowId: string, options: FlowsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  const flow = await client.flows.get(flowId);
  console.log(JSON.stringify(flow, null, 2));
}

export async function runFlowsCreate(
  params: { name: string; project_id: string; template_id?: string; description?: string },
  options: FlowsCmdOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const projectId = params.project_id ?? config.project_id;
  if (!projectId) {
    console.error('Missing project_id. Use: loxtep flows create --name "..." --project-id <id>');
    process.exitCode = 1;
    return;
  }
  const flow = await client.flows.create({
    project_id: projectId,
    name: params.name,
    description: params.description,
    template_id: params.template_id,
  });
  console.log(JSON.stringify(flow, null, 2));
}
