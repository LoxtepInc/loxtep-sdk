/**
 * `loxtep attach [--instance <id>]`
 *
 * Links the project to an existing Instance using the same connection mechanism
 * the Platform_UI uses (client.projects + client.instances / update_project).
 *
 * On success: writes resolved `instance_id` + `api_url` atomically into
 * `.loxtep/project.json`, including a `repository` block when the project is
 * GitHub-bound (R17.2) and omitting it when unbound (R17.3).
 *
 * On failure: exits non-zero, prints the failure reason, and leaves
 * `.loxtep/project.json` byte-unchanged (R1.9).
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Instance } from '../../client/instances-types.js';
import type { Project } from '../../client/projects-types.js';
import {
  requireProject,
  writeProjectConfig,
  preconditionToCliResult,
  type CliResult,
  type ProjectConfig,
  type ProjectRepository,
} from '../project-context.js';

export interface AttachOptions {
  /** Explicit instance ID from `--instance <id>`. When omitted, the org's sole instance is used. */
  instanceId?: string;
  /** Working directory override (defaults to `process.cwd()`). */
  cwd?: string;
}

/**
 * Project the GitHub binding fields from a project record into a
 * {@link ProjectRepository} block, or `undefined` when the project is unbound.
 *
 * A project is considered bound when it has both `github_repo_url` and
 * `github_repo_name` present and non-empty.
 */
export function projectToRepository(project: Project): ProjectRepository | undefined {
  const url = project.github_repo_url;
  const name = project.github_repo_name;

  if (!url || !name) {
    return undefined;
  }

  const repo: ProjectRepository = {
    url,
    name,
    branch: project.github_branch || 'main',
  };

  // Only include subpath when it's a non-empty string.
  if (project.github_repo_path && project.github_repo_path.length > 0) {
    repo.subpath = project.github_repo_path;
  }

  return repo;
}

/**
 * Core attach logic, separated from CLI wiring for testability.
 *
 * Returns a {@link CliResult} so the thin CLI `main()` can map `exitCode` to
 * `process.exitCode` without spawning a process.
 */
export async function runAttach(
  client: LoxtepClient,
  options: AttachOptions = {}
): Promise<CliResult> {
  const cwd = options.cwd ?? process.cwd();

  // 1. Resolve the project config (precondition: .loxtep/project.json must exist).
  const projectResult = requireProject(cwd);
  if (!projectResult.ok) {
    return preconditionToCliResult(projectResult.failure);
  }
  const { project, projectFilePath } = projectResult;

  // 2. Resolve the target instance.
  let instance: Instance;
  try {
    instance = await resolveInstance(client, options.instanceId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Attach failed: ${reason}`],
    };
  }

  // 3. Fetch the project record to read github_* binding fields.
  let projectRecord: Project;
  try {
    projectRecord = await client.workspace.projects.get(project.project_id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Attach failed: could not fetch project record: ${reason}`],
    };
  }

  // 4. Build the new config with instance_id + api_url and optional repository block.
  const repository = projectToRepository(projectRecord);
  const newConfig: ProjectConfig = {
    ...project,
    instance_id: instance.instance_id,
    api_url: instance.api_url,
  };

  // Include the repository block only when bound (R17.2); omit entirely when unbound (R17.3).
  if (repository) {
    newConfig.repository = repository;
  } else {
    delete newConfig.repository;
  }

  // 5. Atomic write via writeProjectConfig (build → validate → write-once).
  try {
    await writeProjectConfig(projectFilePath, newConfig);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Attach failed: could not write project config: ${reason}`],
    };
  }

  // 6. Success output.
  const lines: string[] = [
    `Attached to instance "${instance.name}" (${instance.instance_id}).`,
    `  api_url: ${instance.api_url}`,
  ];
  if (repository) {
    lines.push(`  repository: ${repository.url} (${repository.branch})`);
  }
  return { exitCode: 0, stdout: lines, stderr: [] };
}

/**
 * Resolve the target instance. If `instanceId` is given, fetch it directly.
 * Otherwise list all instances for the org and use the sole one (or error if
 * there are 0 or >1).
 */
async function resolveInstance(client: LoxtepClient, instanceId?: string): Promise<Instance> {
  if (instanceId) {
    try {
      const instance = await client.workspace.instances.get(instanceId);
      if (!instance?.instance_id) {
        throw new Error('empty response from API');
      }
      return instance;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Instance "${instanceId}" could not be resolved: ${msg}`
      );
    }
  }

  // No explicit ID — list all instances and auto-select the sole one.
  const { items } = await client.workspace.instances.list();
  if (items.length === 0) {
    throw new Error(
      'No instances found in your organization. Create one first or specify --instance <id>.'
    );
  }
  if (items.length > 1) {
    const ids = items.map(i => `  ${i.instance_id} — ${i.name}`).join('\n');
    throw new Error(
      `Multiple instances found. Specify one with --instance <id>:\n${ids}`
    );
  }
  return items[0];
}
