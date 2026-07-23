/**
 * CLI: loxtep workflows list | get <id> | create ... | deploy (backend workflows MS).
 */

import { requireCliClient } from '../create-cli-client.js';

export interface WorkflowsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runWorkflowsList(
  options: WorkflowsCmdOptions & { project_id?: string } = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const projectId = options.project_id ?? config.project_id;
  if (!projectId) {
    console.error(
      'Missing project_id. Use: loxtep workflows list --project-id <id> or loxtep config set project_id <id>'
    );
    process.exitCode = 1;
    return;
  }
  const result = await client.build.workflows.list({ project_id: projectId, page_size: 50 });
  console.log(JSON.stringify(result, null, 2));
}

export async function runWorkflowsGet(
  workflowId: string,
  options: WorkflowsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const workflow = await client.build.workflows.get(workflowId);
  console.log(JSON.stringify(workflow, null, 2));
}

export async function runWorkflowsCreate(
  params: { name: string; project_id: string; template_id?: string; description?: string },
  options: WorkflowsCmdOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const projectId = params.project_id ?? config.project_id;
  if (!projectId) {
    console.error('Missing project_id. Use: loxtep workflows create --name "..." --project-id <id>');
    process.exitCode = 1;
    return;
  }
  const workflow = await client.build.workflows.create({
    project_id: projectId,
    name: params.name,
    description: params.description,
    template_id: params.template_id,
  });
  console.log(JSON.stringify(workflow, null, 2));
}

export async function runWorkflowsDeploy(
  params: {
    project_id: string;
    instance_id?: string;
    version_id?: string;
    force_redeploy?: boolean;
  },
  options: WorkflowsCmdOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const instanceId = (params.instance_id && params.instance_id.trim()) || config.instance_id;
  if (!instanceId) {
    console.error(
      'Missing instance_id. Pass --instance-id <id> or loxtep config set instance_id <id>'
    );
    process.exitCode = 1;
    return;
  }
  const result = await client.build.workflows.deploy({
    project_id: params.project_id,
    instance_id: instanceId,
    version_id: params.version_id,
    force_redeploy: params.force_redeploy ?? false,
  });
  console.log(JSON.stringify(result, null, 2));
}
