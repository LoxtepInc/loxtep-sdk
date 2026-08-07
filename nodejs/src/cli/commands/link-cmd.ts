/**
 * `loxtep projects link <project_id|name> [--path .]`
 * Alias: `loxtep link …`
 *
 * Bind a cloud project to a local directory by writing
 * `.loxtep/project.json` and upserting `~/.loxtep/workspaces.json`.
 *
 * Distinct from `loxtep attach`, which binds a runtime **Instance** (instance_id + api_url).
 * Preferred over `init --project-id` when you only need the bind (no scaffold).
 *
 * Flow: link → attach → edit → push → deploy
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Project } from '../../client/projects-types.js';
import { upsertKnownLocal } from '../known-locals-registry.js';
import {
  getProjectFilePath,
  isLocalProjectId,
  PROJECT_DIR_NAME,
  PROJECT_FILE_NAME,
  ProjectConfigSchema,
  writeProjectConfig,
  type CliResult,
  type ProjectConfig,
} from '../project-context.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LinkOptions {
  /** Project id (UUID) or display name from `projects list`. */
  projectRef: string;
  /** Target directory (defaults to cwd). */
  path?: string;
  /** Optional registry path override (tests). */
  registryPath?: string;
}

function readExistingProjectConfig(cwd: string): ProjectConfig | undefined {
  const filePath = getProjectFilePath(cwd);
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed = ProjectConfigSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve a cloud project by UUID or unique name (case-insensitive). */
export async function resolveCloudProject(
  client: LoxtepClient,
  projectRef: string
): Promise<Project> {
  const ref = projectRef.trim();
  if (!ref) {
    throw new Error('Project id or name is required. Usage: loxtep projects link <project_id|name>');
  }

  if (UUID_RE.test(ref)) {
    return client.workspace.projects.get(ref);
  }

  const listed = await client.workspace.projects.list({ page_size: 100, search: ref });
  const exact = listed.items.filter(p => p.name.toLowerCase() === ref.toLowerCase());
  if (exact.length === 1) {
    return exact[0]!;
  }
  if (exact.length > 1) {
    throw new Error(
      `Multiple projects named '${ref}'. Use the project_id UUID from \`loxtep projects list\`.`
    );
  }

  const byId = listed.items.filter(p => p.project_id === ref);
  if (byId.length === 1) {
    return byId[0]!;
  }

  throw new Error(
    `Project '${ref}' not found. Run \`loxtep projects list\` and pass a project_id or exact name.`
  );
}

/**
 * Bind cloud project metadata into `.loxtep/project.json` without requiring GitHub.
 * Preserves attach fields (instance_id / api_url / streams) when already present.
 */
export function buildLinkedProjectConfig(
  cloud: Project,
  existing?: ProjectConfig
): ProjectConfig {
  const config: ProjectConfig = {
    project_id: cloud.project_id,
    organization_id: cloud.organization_id,
  };

  if (existing?.instance_id) config.instance_id = existing.instance_id;
  if (existing?.api_url) config.api_url = existing.api_url;
  if (existing?.region) config.region = existing.region;
  if (existing?.streams) config.streams = existing.streams;
  if (existing?.template_slug) config.template_slug = existing.template_slug;
  if (existing?.repository) config.repository = existing.repository;

  return config;
}

/** Core link logic (testable without spawning the CLI process). */
export async function runLink(client: LoxtepClient, options: LinkOptions): Promise<CliResult> {
  const targetDir = resolve(options.path ?? process.cwd());

  let cloud: Project;
  try {
    cloud = await resolveCloudProject(client, options.projectRef);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Link failed: ${reason}`] };
  }

  const existing = readExistingProjectConfig(targetDir);
  if (
    existing &&
    existing.project_id !== cloud.project_id &&
    !isLocalProjectId(existing.project_id)
  ) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Link failed: directory already bound to project ${existing.project_id}.`,
        `Remove or update ${PROJECT_DIR_NAME}/${PROJECT_FILE_NAME}, or pass a different --path.`,
      ],
    };
  }

  const config = buildLinkedProjectConfig(cloud, existing);
  const projectFilePath = getProjectFilePath(targetDir);

  try {
    await writeProjectConfig(projectFilePath, config);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Link failed: could not write project config: ${reason}`],
    };
  }

  try {
    await upsertKnownLocal({
      path: targetDir,
      project_id: cloud.project_id,
      registryPath: options.registryPath,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Wrote ${projectFilePath} but failed to update known-locals registry: ${reason}`],
    };
  }

  const lines: string[] = [
    `Linked cloud project "${cloud.name}" (${cloud.project_id}) to ${targetDir}`,
    `  wrote ${PROJECT_DIR_NAME}/${PROJECT_FILE_NAME}`,
    `  registered in ~/.loxtep/workspaces.json (known local)`,
    '',
    'Next (distinct from attach):',
    '  1. loxtep attach --instance <instance-id>   # bind runtime Instance',
    '  2. edit local package under this directory',
    '  3. loxtep push                               # Local → Cloud',
    '  4. loxtep deploy                             # Cloud → Deployed',
  ];

  if (!cloud.github_repo_url) {
    lines.push('');
    lines.push('Note: project has no GitHub binding — Studio/S3 + push path (GitHub optional).');
  }

  return { exitCode: 0, stdout: lines, stderr: [] };
}
