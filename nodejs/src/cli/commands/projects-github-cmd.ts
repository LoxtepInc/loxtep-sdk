/**
 * GitHub sync wrappers for bound projects (LOX-1188).
 *
 * - `loxtep projects pull`  → POST /projects/{id}/github/pull  (S3 ← GitHub)
 * - `loxtep projects push`  → POST /projects/{id}/github/push  (S3 → GitHub)
 *
 * Unbound packages keep using top-level `loxtep push` (save_workflow_bundle).
 * These commands refuse when the cloud project has no github_repo_url.
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import { tryLoadProjectConfig, type CliResult } from '../project-context.js';
import { resolveCloudProject } from './link-cmd.js';

export interface GithubSyncOptions {
  /** Override project id (else `.loxtep/project.json`). */
  projectId?: string;
  cwd?: string;
  /** pull only */
  commitSha?: string;
  /** push only */
  commitMessage?: string;
  branch?: string;
}

async function resolveBoundProjectId(
  client: LoxtepClient,
  options: GithubSyncOptions
): Promise<{ project_id: string; name: string } | CliResult> {
  const cwd = options.cwd ?? process.cwd();
  let projectId = options.projectId;
  if (!projectId) {
    const loaded = tryLoadProjectConfig(cwd);
    if (!loaded) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          'No .loxtep/project.json found. Run from a cloned/linked workspace or pass --project-id.',
        ],
      };
    }
    projectId = loaded.project.project_id;
  }

  let cloud;
  try {
    cloud = await resolveCloudProject(client, projectId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`GitHub sync failed: ${reason}`] };
  }

  if (!cloud.github_repo_url) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Project "${cloud.name}" (${cloud.project_id}) has no GitHub binding.`,
        'Use `loxtep push` for unbound Local→Cloud package upload — do not pretend Git.',
      ],
    };
  }

  return { project_id: cloud.project_id, name: cloud.name };
}

export async function runProjectsGithubPull(
  client: LoxtepClient,
  options: GithubSyncOptions = {}
): Promise<CliResult> {
  const resolved = await resolveBoundProjectId(client, options);
  if ('exitCode' in resolved) return resolved;

  try {
    const result = await client.workspace.projects.github_pull(resolved.project_id, {
      commit_sha: options.commitSha,
    });
    const ok = result.success !== false;
    const lines = [
      `GitHub pull for "${resolved.name}" (${resolved.project_id}): ${ok ? 'ok' : 'failed'}`,
      result.commit_sha ? `  commit_sha: ${result.commit_sha}` : '',
      result.file_count != null ? `  file_count: ${result.file_count}` : '',
      result.message ? `  ${result.message}` : '',
    ].filter(Boolean);
    if (result.errors?.length) {
      return {
        exitCode: 1,
        stdout: lines,
        stderr: result.errors,
      };
    }
    return { exitCode: ok ? 0 : 1, stdout: lines, stderr: ok ? [] : ['GitHub pull failed'] };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`GitHub pull failed: ${reason}`] };
  }
}

export async function runProjectsGithubPush(
  client: LoxtepClient,
  options: GithubSyncOptions = {}
): Promise<CliResult> {
  const resolved = await resolveBoundProjectId(client, options);
  if ('exitCode' in resolved) return resolved;

  try {
    const result = await client.workspace.projects.github_push(resolved.project_id, {
      commit_message: options.commitMessage,
      branch: options.branch,
    });
    const ok = result.success !== false;
    const lines = [
      `GitHub push for "${resolved.name}" (${resolved.project_id}): ${ok ? 'ok' : 'failed'}`,
      result.commit_sha ? `  commit_sha: ${result.commit_sha}` : '',
      result.commit_url ? `  commit_url: ${result.commit_url}` : '',
      result.file_count != null ? `  file_count: ${result.file_count}` : '',
      result.message ? `  ${result.message}` : '',
    ].filter(Boolean);
    if (result.errors?.length) {
      return {
        exitCode: 1,
        stdout: lines,
        stderr: result.errors,
      };
    }
    return { exitCode: ok ? 0 : 1, stdout: lines, stderr: ok ? [] : ['GitHub push failed'] };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`GitHub push failed: ${reason}`] };
  }
}
