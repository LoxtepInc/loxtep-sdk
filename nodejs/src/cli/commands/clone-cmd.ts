/**
 * `loxtep projects clone <project_id|name> [dir]`
 *
 * Cloud → Local materialization (Railway-style “I have it in the cloud — get it here”).
 *
 * - **GitHub-bound:** `git clone` using `github_repo_url` (+ optional `github_repo_path`),
 *   then link-equivalent bind (`.loxtep/project.json` + known-locals).
 * - **Unbound:** authenticated workspace export (`POST .../export`), write entity JSON
 *   files locally, then the same bind. Never pretends Git exists for unbound projects.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Project } from '../../client/projects-types.js';
import type { ProjectWorkspaceExportResult } from '../../client/projects.js';
import { upsertKnownLocal } from '../known-locals-registry.js';
import {
  getProjectFilePath,
  PROJECT_DIR_NAME,
  PROJECT_FILE_NAME,
  writeProjectConfig,
  type CliResult,
} from '../project-context.js';
import {
  buildLinkedProjectConfig,
  resolveCloudProject,
} from './link-cmd.js';

export interface CloneOptions {
  projectRef: string;
  /** Destination directory (defaults to sanitized project name). */
  dir?: string;
  /** Optional registry path override (tests). */
  registryPath?: string;
  /**
   * Test hooks — inject instead of real git / network for unit tests.
   */
  gitClone?: (args: {
    url: string;
    targetDir: string;
    branch?: string;
  }) => Promise<void>;
  fetchExportJson?: (url: string) => Promise<ProjectWorkspaceExportResult['export_data']>;
}

function sanitizeDirName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'project';
}

function isGithubBound(cloud: Project): boolean {
  return Boolean(cloud.github_repo_url && cloud.github_repo_url.trim());
}

/** Inject GH_TOKEN / GITHUB_TOKEN into https clone URLs when present. */
export function withGitHubAuth(cloneUrl: string): string {
  const token = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  if (!token) return cloneUrl;
  try {
    const u = new URL(cloneUrl);
    if (u.protocol !== 'https:') return cloneUrl;
    if (u.username || u.password) return cloneUrl;
    u.username = 'x-access-token';
    u.password = token;
    return u.toString();
  } catch {
    return cloneUrl;
  }
}

async function defaultGitClone(args: {
  url: string;
  targetDir: string;
  branch?: string;
}): Promise<void> {
  const authUrl = withGitHubAuth(args.url);
  const cmd = ['clone', '--depth', '1'];
  if (args.branch) {
    cmd.push('--branch', args.branch);
  }
  cmd.push(authUrl, args.targetDir);
  const res = spawnSync('git', cmd, {
    encoding: 'utf-8',
    env: process.env,
  });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || 'git clone failed').trim();
    // Avoid leaking tokens in error paths if auth URL was rewritten
    const scrubbed = err.replace(/x-access-token:[^@\s]+@/g, 'x-access-token:***@');
    throw new Error(scrubbed || 'git clone failed');
  }
}

async function defaultFetchExportJson(
  url: string
): Promise<ProjectWorkspaceExportResult['export_data']> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download export (${res.status} ${res.statusText})`);
  }
  const json = (await res.json()) as ProjectWorkspaceExportResult['export_data'] | {
    export_data?: ProjectWorkspaceExportResult['export_data'];
  };
  if (json && typeof json === 'object' && 'entities' in json && Array.isArray(json.entities)) {
    return json as ProjectWorkspaceExportResult['export_data'];
  }
  if (
    json &&
    typeof json === 'object' &&
    'export_data' in json &&
    json.export_data &&
    Array.isArray(json.export_data.entities)
  ) {
    return json.export_data;
  }
  throw new Error('Export download did not contain entities[]');
}

/**
 * Write exported entities as `<entity_type>/<entity_id>.json` under `targetDir`.
 * Entity type strings already match Studio folder names (workflows, data-products, …).
 */
export async function materializeExportToDir(
  targetDir: string,
  exportData: NonNullable<ProjectWorkspaceExportResult['export_data']>
): Promise<number> {
  let written = 0;
  for (const entity of exportData.entities ?? []) {
    const type = String(entity.entity_type || '').replace(/^\/+|\/+$/g, '');
    const id = String(entity.entity_id || '').replace(/[/\\]/g, '_');
    if (!type || !id) continue;
    const dir = join(targetDir, type);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${id}.json`);
    await writeFile(filePath, `${JSON.stringify(entity.data, null, 2)}\n`, 'utf-8');
    written += 1;
  }
  return written;
}

async function bindLocalWorkspace(
  targetDir: string,
  cloud: Project,
  registryPath?: string
): Promise<{ projectFilePath: string }> {
  const config = buildLinkedProjectConfig(cloud);
  // Prefer repository metadata from cloud when GH-bound so status enrichment can see it.
  if (cloud.github_repo_url && cloud.github_repo_name) {
    config.repository = {
      url: cloud.github_repo_url,
      name: cloud.github_repo_name,
      branch: cloud.github_branch || 'main',
      ...(cloud.github_repo_path ? { subpath: cloud.github_repo_path } : {}),
    };
  }
  const projectFilePath = getProjectFilePath(targetDir);
  await writeProjectConfig(projectFilePath, config);
  await upsertKnownLocal({
    path: targetDir,
    project_id: cloud.project_id,
    registryPath,
  });
  return { projectFilePath };
}

async function cloneGithubBound(
  client: LoxtepClient,
  cloud: Project,
  targetDir: string,
  options: CloneOptions
): Promise<CliResult> {
  const url = cloud.github_repo_url!.trim();
  const branch = cloud.github_branch || undefined;
  const gitClone = options.gitClone ?? defaultGitClone;

  if (existsSync(targetDir)) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Clone failed: directory already exists: ${targetDir}`],
    };
  }

  try {
    await gitClone({ url, targetDir, branch });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Clone failed (git): ${reason}`,
        'Tip: set GH_TOKEN or GITHUB_TOKEN for private HTTPS clones, or configure git credentials.',
      ],
    };
  }

  const subpath = (cloud.github_repo_path || '').replace(/^\/+|\/+$/g, '');
  const workspaceRoot = subpath ? join(targetDir, subpath) : targetDir;
  if (subpath && !existsSync(workspaceRoot)) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Clone succeeded but github_repo_path "${subpath}" was not found under ${targetDir}.`,
      ],
    };
  }

  try {
    await bindLocalWorkspace(workspaceRoot, cloud, options.registryPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Cloned repo but failed to write project bind: ${reason}`],
    };
  }

  const lines = [
    `Cloned GitHub-bound project "${cloud.name}" (${cloud.project_id})`,
    `  git: ${url}${branch ? ` @ ${branch}` : ''}`,
    `  workspace: ${workspaceRoot}`,
    `  wrote ${PROJECT_DIR_NAME}/${PROJECT_FILE_NAME}`,
    `  registered in ~/.loxtep/workspaces.json (known local)`,
    '',
    'Next:',
    '  cd ' + workspaceRoot,
    '  loxtep status',
    '  loxtep attach --instance <instance-id>',
    '  loxtep projects pull   # Cloud S3 ← GitHub (when bound)',
    '  loxtep projects push   # Cloud S3 → GitHub (when bound); unbound Local→Cloud uses `loxtep push`',
  ];
  return { exitCode: 0, stdout: lines, stderr: [] };
}

async function cloneUnboundExport(
  client: LoxtepClient,
  cloud: Project,
  targetDir: string,
  options: CloneOptions
): Promise<CliResult> {
  if (existsSync(targetDir) && existsSync(getProjectFilePath(targetDir))) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Clone failed: ${targetDir} already has ${PROJECT_DIR_NAME}/${PROJECT_FILE_NAME}.`,
        'Use `loxtep projects link` to rebind, or pick another directory.',
      ],
    };
  }

  mkdirSync(targetDir, { recursive: true });

  let exported: ProjectWorkspaceExportResult;
  try {
    exported = await client.workspace.projects.export_workspace(cloud.project_id, {
      subscription_tier: 'enterprise',
      validate_size: false,
      include_drafts: false,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Clone failed (workspace export): ${reason}`,
        'Unbound projects require POST /workflows/projects/{id}/export (deploy workflows MS if missing).',
      ],
    };
  }

  let exportData = exported.export_data;
  if (!exportData && exported.presigned_url) {
    const fetchJson = options.fetchExportJson ?? defaultFetchExportJson;
    try {
      exportData = await fetchJson(exported.presigned_url);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        stdout: [],
        stderr: [`Clone failed downloading export artifact: ${reason}`],
      };
    }
  }

  if (!exportData?.entities) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['Clone failed: export response had neither export_data nor a usable presigned_url.'],
    };
  }

  let entityCount = 0;
  try {
    entityCount = await materializeExportToDir(targetDir, exportData);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Clone failed writing entities: ${reason}`] };
  }

  try {
    await bindLocalWorkspace(targetDir, cloud, options.registryPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Wrote ${entityCount} entities but failed to bind project config: ${reason}`],
    };
  }

  const lines = [
    `Cloned unbound project "${cloud.name}" (${cloud.project_id}) via workspace export`,
    `  directory: ${targetDir}`,
    `  entities: ${entityCount}`,
    `  wrote ${PROJECT_DIR_NAME}/${PROJECT_FILE_NAME}`,
    `  registered in ~/.loxtep/workspaces.json (known local)`,
    '',
    'Next:',
    '  cd ' + targetDir,
    '  loxtep status',
    '  loxtep attach --instance <instance-id>',
    '  loxtep push              # Local → Cloud (unbound package path; not Git)',
    '',
    'Note: this project has no GitHub binding — do not use `projects pull/push` (those wrap GitHub sync APIs).',
  ];
  return { exitCode: 0, stdout: lines, stderr: [] };
}

/** Core clone logic (testable without spawning the CLI process). */
export async function runClone(client: LoxtepClient, options: CloneOptions): Promise<CliResult> {
  let cloud: Project;
  try {
    cloud = await resolveCloudProject(client, options.projectRef);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Clone failed: ${reason}`] };
  }

  const defaultName = sanitizeDirName(cloud.name || basename(cloud.project_id));
  const targetDir = resolve(options.dir ?? defaultName);

  if (isGithubBound(cloud)) {
    return cloneGithubBound(client, cloud, targetDir, options);
  }
  return cloneUnboundExport(client, cloud, targetDir, options);
}
