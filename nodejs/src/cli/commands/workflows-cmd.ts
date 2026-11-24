/**
 * CLI: loxtep workflows list | get <id> | create ... | deploy (backend workflows MS).
 */

import { toWorkflowListSummary } from '../../client/list-summaries.js';
import { mapListSummaries, printCliListOutput } from '../cli-list-output.js';
import { requireCliClient } from '../create-cli-client.js';
import { ConflictError } from '../../errors/resource.js';

function formatDeployFailure(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  if (err instanceof ConflictError && /environment_key/i.test(base)) {
    return (
      `${base}\n` +
      'Hint: the target Instance metadata.environment_key disagrees with --expected-environment-key. ' +
      'Run `loxtep instances list` or `loxtep whoami` (attached workspace) to confirm the Instance pin, ' +
      'then retry with a matching --expected-environment-key or attach the correct Instance.'
    );
  }
  return base;
}

export interface WorkflowsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

export async function runWorkflowsList(
  options: WorkflowsCmdOptions & { project_id?: string } = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const projectId = options.project_id ?? config.project_id;
  if (!projectId) {
    console.error(
      'Missing project_id. Run from your workspace after `loxtep init`, or:\n' +
        '  pnpm exec loxtep config list              # project_id from .loxtep/project.json\n' +
        '  pnpm exec loxtep projects list            # all projects in your org\n' +
        '  pnpm exec loxtep workflows list --project-id <uuid>'
    );
    process.exitCode = 1;
    return;
  }
  const result = await client.build.workflows.list({ project_id: projectId, page_size: 50 });
  const summary = mapListSummaries(result, toWorkflowListSummary);
  printCliListOutput(summary, result, { ...options, label: 'workflows list' });
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
  params: {
    name: string;
    project_id: string;
    template_id?: string;
    description?: string;
    workflow_type?: 'ingestion' | 'enrichment' | 'delivery';
    domain_id?: string;
  },
  options: WorkflowsCmdOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const projectId = params.project_id ?? config.project_id;
  if (!projectId) {
    console.error('Missing project_id. Use: loxtep workflows create --name "..." --project-id <id>');
    process.exitCode = 1;
    return;
  }

  let domainId = params.domain_id;
  if (!domainId) {
    const domains = await client.define.domains.list({ page_size: 1 });
    domainId = domains.items?.[0]?.domain_id;
  }
  if (!domainId) {
    console.error(
      'Missing domain_id. Pass --domain-id <uuid> or create a domain first (`loxtep domains create`).'
    );
    process.exitCode = 1;
    return;
  }

  const workflowType = params.workflow_type ?? 'ingestion';
  const workflow = await client.build.workflows.create({
    project_id: projectId,
    name: params.name,
    description: params.description,
    template_id: params.template_id,
    workflow_type: workflowType,
    domain_id: domainId,
  });
  console.log(JSON.stringify(workflow, null, 2));
}

export async function runWorkflowsDeploy(
  params: {
    project_id: string;
    instance_id?: string;
    expected_environment_key?: string;
    version_id?: string;
    force_redeploy?: boolean;
  },
  options: WorkflowsCmdOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  // Explicit instance for this deploy (#4867). Attached project instance_id
  // counts as explicit; never invent a soft prefer across orgs.
  const instanceId = (params.instance_id && params.instance_id.trim()) || config.instance_id;
  if (!instanceId) {
    console.error(
      'Missing Instance id. Pass --instance-id <id> for the Instance you are deploying to, or run `loxtep attach` so .loxtep/project.json pins the same Instance as Studio. Soft prefer is not supported.'
    );
    process.exitCode = 1;
    return;
  }
  try {
    const result = await client.build.workflows.deploy({
      project_id: params.project_id,
      instance_id: instanceId,
      version_id: params.version_id,
      force_redeploy: params.force_redeploy ?? false,
      ...(params.expected_environment_key
        ? { expected_environment_key: params.expected_environment_key }
        : {}),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Deploy failed: ${formatDeployFailure(err)}`);
    process.exitCode = 1;
  }
}

export async function runWorkflowsPreviewQueryTrigger(
  params: {
    workflow_id: string;
    project_id?: string;
    query?: string;
    primary_key?: string[];
    limit?: number;
  },
  options: WorkflowsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  if (!params.workflow_id) {
    console.error(
      'Usage: loxtep workflows preview-query-trigger --workflow-id <uuid> [--project-id <uuid>] [--query <sql>] [--limit N] [--primary-key a,b]'
    );
    process.exitCode = 1;
    return;
  }
  const result = await client.build.workflows.preview_query_trigger({
    workflow_id: params.workflow_id,
    project_id: params.project_id,
    query: params.query,
    primary_key: params.primary_key,
    limit: params.limit,
  });
  console.log(JSON.stringify(result, null, 2));
}

export async function runWorkflowsRunQueryTrigger(
  params: {
    workflow_id: string;
    project_id?: string;
    query?: string;
    primary_key?: string[];
    sink_data_product_id?: string;
  },
  options: WorkflowsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  if (!params.workflow_id) {
    console.error(
      'Usage: loxtep workflows run-query-trigger --workflow-id <uuid> [--project-id <uuid>] [--sink-data-product-id <uuid>]'
    );
    process.exitCode = 1;
    return;
  }
  const result = await client.build.workflows.run_query_trigger({
    workflow_id: params.workflow_id,
    project_id: params.project_id,
    query: params.query,
    primary_key: params.primary_key,
    sink_data_product_id: params.sink_data_product_id,
  });
  console.log(JSON.stringify(result, null, 2));
}
