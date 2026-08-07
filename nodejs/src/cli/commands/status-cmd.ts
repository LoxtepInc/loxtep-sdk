/**
 * CLI: loxtep status [--unpublished] [--json]
 *
 * Cwd-first project workspace status (local / cloud / deployed).
 * Distinct from `loxtep observe status` (runtime bots/queues).
 */

import {
  buildProjectWorkspaceStatus,
  formatProjectWorkspaceStatusLines,
  type LocalProjectSnapshot,
} from '../../client/project-workspace-status.js';
import type { Deployment } from '../../client/deployments-types.js';
import { requireCliClient, type CreateCliClientOptions } from '../create-cli-client.js';
import { tryLoadProjectConfig } from '../project-context.js';
import type { CliResult } from '../project-context.js';

export interface StatusCmdOptions extends CreateCliClientOptions {
  cwd?: string;
  /** Emit full JSON status payload instead of the one-screen text view. */
  json?: boolean;
  /** Entity/file inventory (population_depth: unpublished). */
  unpublished?: boolean;
}

function localSnapshotFromCwd(cwd: string): LocalProjectSnapshot | null {
  const loaded = tryLoadProjectConfig(cwd);
  if (!loaded) return null;
  return {
    project_id: loaded.project.project_id,
    path: loaded.projectDir,
    project_file: loaded.projectFilePath,
    instance_id: loaded.project.instance_id ?? null,
    api_url: loaded.project.api_url ?? null,
  };
}

async function listCloudWorkflowIds(
  client: Awaited<ReturnType<typeof requireCliClient>>['client'],
  projectId: string
): Promise<{ ids: string[] | null; unavailable: boolean }> {
  try {
    const listed = await client.build.workflows.list({
      project_id: projectId,
      page_size: 100,
    });
    const items = listed.items ?? [];
    return {
      ids: items.map(w => w.workflow_id).filter((id): id is string => typeof id === 'string'),
      unavailable: false,
    };
  } catch {
    return { ids: null, unavailable: true };
  }
}

/**
 * Execute `loxtep status` (structured {@link CliResult} for tests).
 */
export async function runStatusCommand(options: StatusCmdOptions = {}): Promise<CliResult> {
  const cwd = options.cwd ?? process.cwd();
  const local = localSnapshotFromCwd(cwd);
  const population_depth = options.unpublished ? 'unpublished' : 'status';

  if (!local) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        'No .loxtep/project.json found in this directory or any parent. Run `loxtep init` first.',
        '(Distinct from `loxtep observe status`, which reports runtime bots/queues.)',
      ],
    };
  }

  const { client } = await requireCliClient(options);

  let cloud = null;
  try {
    cloud = await client.workspace.projects.get(local.project_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = buildProjectWorkspaceStatus({
      population_depth,
      local,
      cloud: null,
      deployments: null,
      deployments_unavailable: true,
      notes: [`Cloud project get failed: ${message}`],
    });
    if (options.json) {
      return { exitCode: 0, stdout: [JSON.stringify(status, null, 2)], stderr: [] };
    }
    return {
      exitCode: 0,
      stdout: formatProjectWorkspaceStatusLines(status),
      stderr: [],
    };
  }

  let deployments: Deployment[] | null = null;
  let deployments_unavailable = false;
  try {
    const listed = await client.workspace.deployments.list({
      project_id: local.project_id,
      page_size: 20,
      sort_by: 'updated_at',
      sort_order: 'desc',
    });
    deployments = listed.items;
  } catch {
    deployments_unavailable = true;
  }

  let cloud_workflow_ids: string[] | null = null;
  let cloud_list_unavailable = false;
  if (options.unpublished) {
    const cloudList = await listCloudWorkflowIds(client, local.project_id);
    cloud_workflow_ids = cloudList.ids;
    cloud_list_unavailable = cloudList.unavailable;
  }

  const status = buildProjectWorkspaceStatus({
    population_depth,
    local,
    cloud,
    deployments,
    deployments_unavailable,
    cloud_workflow_ids,
    cloud_list_unavailable,
  });

  if (options.json) {
    return { exitCode: 0, stdout: [JSON.stringify(status, null, 2)], stderr: [] };
  }
  return {
    exitCode: 0,
    stdout: formatProjectWorkspaceStatusLines(status),
    stderr: [],
  };
}

export async function runStatus(options: StatusCmdOptions = {}): Promise<void> {
  const result = await runStatusCommand(options);
  for (const line of result.stdout) console.log(line);
  for (const line of result.stderr) console.error(line);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
