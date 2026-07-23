/**
 * CLI: loxtep projects list | projects get <id>
 * Projects are the platform container for workflows, connectors, and deploy targets.
 */

import { toProjectListSummary } from '../../client/list-summaries.js';
import { mapPaginatedList, printCliListOutput } from '../cli-list-output.js';
import { requireCliClient } from '../create-cli-client.js';

export interface ProjectsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

export async function runProjectsList(options: ProjectsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.workspace.projects.list({ page_size: 100 });
    const summary = mapPaginatedList(result, toProjectListSummary);
    printCliListOutput(summary, result, { ...options, label: 'projects list' });
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runProjectsGet(
  projectId: string,
  options: ProjectsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const project = await client.workspace.projects.get(projectId);
    console.log(JSON.stringify(project, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
