/**
 * `loxtep init [--template <slug>] [--project-id <uuid>] [--create-repo|--from-repo]`
 *
 * Scaffolds a new Loxtep project:
 *   - `.loxtep/project.json` + `domains/` + `connectors/` + `workflows/` + `data-products/`
 *   - Requires authentication to register (or bind) a platform project — no silent
 *     `proj_local_*` ids that break API commands later.
 *   - `--project-id <uuid>` binds an existing org project instead of creating one.
 *   - Re-running `init` after login upgrades a stale local-only `project_id`.
 *   - With `--template <slug>`: materializes a **bundled** runnable template
 *     (e.g. `shopify-orders`). Non-bundled / catalog-only slugs exit non-zero —
 *     no silent AGENTS.md/skill stub without workflows (#88).
 *   - Repo flags → `github_action` on `create_project`:
 *     `--create-repo` → `create_new` (private default),
 *     `--from-repo <url>` → `import_existing`,
 *     neither → `none`,
 *     both → reject (exit 1).
 *   - Always prints Getting Started + Quick Reference links (R11.7).
 *   - Auto-runs `generate` when authed+attached; fails the whole `init` if
 *     `generate` fails (R16.3, R16.4).
 *   - Prints login/attach/generate guidance otherwise (R16.5).
 *
 * Requirements: 1.1, 1.2, 11.7, 16.1, 16.2, 16.3, 16.4, 16.5, 17.4, 17.5, 17.6
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { CliResult } from '../project-context.js';
import {
  PROJECT_DIR_NAME,
  PROJECT_FILE_NAME,
  writeProjectConfig,
  isLocalProjectId,
  LOCAL_PROJECT_ID_PREFIX,
  ProjectConfigSchema,
  type ProjectConfig,
} from '../project-context.js';
import { upsertKnownLocal } from '../known-locals-registry.js';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { CreateProjectInput } from '../../client/projects-types.js';
import {
  ensureTemplatePackageJson,
  listBundledTemplateSlugs,
  materializeBundledTemplate,
  resolveBundledTemplateDir,
} from '../templates-materialize.js';

/* ------------------------------------------------------------------ */
/*  Doc links (R11.7)                                                  */
/* ------------------------------------------------------------------ */

const GETTING_STARTED_URL = 'https://app.loxtep.io/docs/getting-started.md';
const QUICK_REFERENCE_URL = 'https://app.loxtep.io/docs/quick-reference.md';

/* ------------------------------------------------------------------ */
/*  Repo flag → github_action pure mapping (R17.4, R17.5, R17.6)      */
/* ------------------------------------------------------------------ */

export type GithubAction = 'create_new' | 'import_existing' | 'none';

export interface RepoFlagInput {
  createRepo?: string | boolean;
  fromRepo?: string;
}

/**
 * Map CLI `--create-repo` / `--from-repo` flags to the `github_action` value
 * for `create_project`.
 *
 * - `--create-repo` → `create_new` (private default) (R17.4)
 * - `--from-repo <url>` → `import_existing` (R17.5)
 * - neither → `none` (R17.6)
 * - both → reject (returns an error string)
 */
export function repoFlagsToGithubAction(
  flags: RepoFlagInput
): { ok: true; action: GithubAction; repoName?: string; importUrl?: string } | { ok: false; error: string } {
  const hasCreate = flags.createRepo !== undefined && flags.createRepo !== false;
  const hasFrom = flags.fromRepo !== undefined && flags.fromRepo !== '';

  if (hasCreate && hasFrom) {
    return { ok: false, error: 'Cannot specify both --create-repo and --from-repo.' };
  }

  if (hasCreate) {
    const repoName = typeof flags.createRepo === 'string' ? flags.createRepo : undefined;
    return { ok: true, action: 'create_new', repoName };
  }

  if (hasFrom) {
    return { ok: true, action: 'import_existing', importUrl: flags.fromRepo };
  }

  return { ok: true, action: 'none' };
}

/* ------------------------------------------------------------------ */
/*  Init command options                                               */
/* ------------------------------------------------------------------ */

export interface InitOptions {
  /** Current working directory to scaffold into. */
  cwd: string;
  /** Template slug to use (`--template <slug>`). */
  templateSlug?: string;
  /** `--create-repo [name]` flag. */
  createRepo?: string | boolean;
  /** `--from-repo <url>` flag. */
  fromRepo?: string;
  /** Project name (defaults to directory basename). */
  name?: string;
  /**
   * Bind an existing platform project (`--project-id <uuid>`) instead of creating one.
   */
  projectId?: string;
  /**
   * Test-only: scaffold without platform registration (writes a local-only project_id).
   * Not exposed on the CLI.
   */
  offline?: boolean;
  /**
   * Optional pre-authenticated client. When provided and the project is
   * attached, the init will auto-run generate.
   */
  client?: LoxtepClient | null;
  /**
   * Optional instance_id. When provided together with `apiUrl`, the project is
   * considered already attached, enabling auto-generate (R16.3).
   */
  instanceId?: string;
  /**
   * Optional API URL. When provided together with `instanceId`, the project is
   * considered already attached, enabling auto-generate (R16.3).
   */
  apiUrl?: string;
  /**
   * Optional generate function (injected for testability). If provided, called
   * after scaffold when authed+attached. Receives cwd and the client.
   */
  runGenerate?: (cwd: string, client: LoxtepClient) => Promise<CliResult>;
}

/* ------------------------------------------------------------------ */
/*  Scaffold helpers                                                   */
/* ------------------------------------------------------------------ */

const STANDARD_DIRS = ['domains', 'connectors', 'workflows', 'data-products'] as const;

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

function readExistingProjectConfig(cwd: string): ProjectConfig | undefined {
  const filePath = join(cwd, PROJECT_DIR_NAME, PROJECT_FILE_NAME);
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed = ProjectConfigSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

type PlatformProjectResolution =
  | {
      ok: true;
      projectId: string;
      organizationId?: string;
      /** Human-readable note for stdout (upgrade, bind, idempotent re-init). */
      note?: string;
    }
  | { ok: false; error: string };

async function resolvePlatformProject(options: {
  cwd: string;
  client?: LoxtepClient | null;
  projectId?: string;
  name?: string;
  templateSlug?: string;
  repoResult: Extract<ReturnType<typeof repoFlagsToGithubAction>, { ok: true }>;
  offline?: boolean;
}): Promise<PlatformProjectResolution> {
  const { cwd, client, projectId: explicitProjectId, offline } = options;
  const existing = readExistingProjectConfig(cwd);

  if (explicitProjectId) {
    if (!client) {
      return {
        ok: false,
        error: 'Authentication required for --project-id. Run `loxtep login` first.',
      };
    }
    try {
      const project = await client.workspace.projects.get(explicitProjectId);
      return {
        ok: true,
        projectId: project.project_id,
        organizationId: project.organization_id,
        note: `Bound existing platform project ${project.project_id}.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Project '${explicitProjectId}' not found or not accessible: ${msg}. Run \`loxtep projects list\`.`,
      };
    }
  }

  if (existing && !isLocalProjectId(existing.project_id)) {
    if (client) {
      try {
        const project = await client.workspace.projects.get(existing.project_id);
        return {
          ok: true,
          projectId: project.project_id,
          organizationId: project.organization_id,
          note: `Project already initialized (${project.project_id}).`,
        };
      } catch {
        return {
          ok: true,
          projectId: existing.project_id,
          organizationId: existing.organization_id,
          note: `Project already initialized (${existing.project_id}).`,
        };
      }
    }
    return {
      ok: true,
      projectId: existing.project_id,
      organizationId: existing.organization_id,
      note: `Project already initialized (${existing.project_id}).`,
    };
  }

  if (!client) {
    if (offline) {
      return {
        ok: true,
        projectId: `${LOCAL_PROJECT_ID_PREFIX}${Date.now().toString(36)}`,
      };
    }
    return {
      ok: false,
      error:
        'Authentication required to register a platform project. Run `loxtep login` first, then `loxtep init`. ' +
        'To bind an existing project: `loxtep init --project-id <uuid>`.',
    };
  }

  const projectName = options.name || cwd.split('/').pop() || 'loxtep-project';
  const createBody: CreateProjectInput = {
    name: projectName,
    template_slug: options.templateSlug,
    github_action: options.repoResult.action,
  };
  if (options.repoResult.action === 'create_new' && options.repoResult.repoName) {
    createBody.github_repo_name = options.repoResult.repoName;
  }
  if (options.repoResult.action === 'import_existing' && options.repoResult.importUrl) {
    createBody.github_import_url = options.repoResult.importUrl;
  }

  try {
    const project = await client.workspace.projects.create(createBody);
    const upgraded = existing != null && isLocalProjectId(existing.project_id);
    return {
      ok: true,
      projectId: project.project_id,
      organizationId: project.organization_id,
      note: upgraded
        ? `Registered platform project ${project.project_id} (replaced local-only project_id).`
        : `Created platform project ${project.project_id}.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Could not create project on platform: ${msg}`,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Main init logic                                                    */
/* ------------------------------------------------------------------ */

export async function runInitCommand(options: InitOptions): Promise<CliResult> {
  const { cwd, templateSlug, createRepo, fromRepo, client } = options;
  const stdout: string[] = [];
  const stderr: string[] = [];

  // --- Validate repo flags (R17.4/R17.5/R17.6: both → reject) ---
  const repoResult = repoFlagsToGithubAction({ createRepo, fromRepo });
  if (!repoResult.ok) {
    return { exitCode: 1, stdout: [], stderr: [repoResult.error] };
  }

  // --- Fail closed on non-bundled --template slugs (#88) ---
  // Catalog/industry slugs must not silently write AGENTS.md + skill with no workflows.
  if (templateSlug) {
    let bundledDir: string | null;
    try {
      bundledDir = resolveBundledTemplateDir(templateSlug);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { exitCode: 1, stdout: [], stderr: [msg] };
    }
    if (!bundledDir) {
      let available: string[] = [];
      try {
        available = await listBundledTemplateSlugs();
      } catch {
        // Package-root resolution already succeeded for resolveBundledTemplateDir(null path);
        // listing failure should not mask the primary error.
      }
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          `Template "${templateSlug}" is not bundled in this SDK; refusing to scaffold a stub without workflows.`,
          `Bundled templates: ${available.length > 0 ? available.join(', ') : '(none)'}.`,
        ],
      };
    }
  }

  // --- Scaffold standard directories first (always) ---
  for (const dir of STANDARD_DIRS) {
    await ensureDir(join(cwd, dir));
  }

  const loxtepDir = join(cwd, PROJECT_DIR_NAME);
  await ensureDir(loxtepDir);

  const existing = readExistingProjectConfig(cwd);

  const platform = await resolvePlatformProject({
    cwd,
    client,
    projectId: options.projectId,
    name: options.name,
    templateSlug,
    repoResult,
    offline: options.offline,
  });

  if (!platform.ok) {
    return {
      exitCode: 1,
      stdout,
      stderr: [platform.error],
    };
  }

  if (platform.note) {
    stdout.push(platform.note);
  }

  const projectId = platform.projectId;
  const organizationId = platform.organizationId;

  const config: ProjectConfig = {
    project_id: projectId,
    ...(organizationId ? { organization_id: organizationId } : {}),
    ...(templateSlug ? { template_slug: templateSlug } : existing?.template_slug ? { template_slug: existing.template_slug } : {}),
    ...(options.instanceId ? { instance_id: options.instanceId } : existing?.instance_id ? { instance_id: existing.instance_id } : {}),
    ...(options.apiUrl ? { api_url: options.apiUrl } : existing?.api_url ? { api_url: existing.api_url } : {}),
    ...(existing?.repository ? { repository: existing.repository } : {}),
  };

  const projectFilePath = join(loxtepDir, PROJECT_FILE_NAME);
  await writeProjectConfig(projectFilePath, config);

  // Known-locals registry (Phase C) — same bind story as `loxtep projects link`.
  if (!isLocalProjectId(projectId)) {
    try {
      await upsertKnownLocal({ path: cwd, project_id: projectId });
    } catch {
      // Non-fatal: project.json is the bind source of truth; registry is an index.
    }
  }

  // --- Template-specific scaffolding (R16.1, R16.2) — bundled only (#88) ---
  if (templateSlug) {
    const materialized = await materializeBundledTemplate(cwd, templateSlug);
    if (!materialized || materialized.written.length === 0) {
      return {
        exitCode: 1,
        stdout,
        stderr: [
          `Template "${templateSlug}" is bundled but produced no files; refusing to continue with an empty scaffold.`,
        ],
      };
    }
    stdout.push(`✓ Scaffolded template files from bundled "${templateSlug}"`);
    for (const rel of materialized.written) {
      stdout.push(`  ✓ ${rel}`);
    }
    const pkgUpdated = await ensureTemplatePackageJson(cwd);
    if (pkgUpdated) {
      stdout.push(`  ✓ ${pkgUpdated} (type=module, @loxtep/sdk dependency)`);
    }
  }

  stdout.push(`Initialized Loxtep project in ${cwd}`);
  if (templateSlug) {
    stdout.push(`  Template: ${templateSlug}`);
  }
  stdout.push('');

  // --- Always print Getting Started + Quick Reference links (R11.7) ---
  stdout.push(`Getting Started: ${GETTING_STARTED_URL}`);
  stdout.push(`Quick Reference: ${QUICK_REFERENCE_URL}`);
  stdout.push('');

  // --- Auto-run generate when authed+attached (R16.3, R16.4, R16.5) ---
  const isAttached = config.instance_id && config.api_url;

  if (client && isAttached && options.runGenerate) {
    // Project is authed + attached — run generate
    const genResult = await options.runGenerate(cwd, client);
    if (genResult.exitCode !== 0) {
      // R16.4: if generate fails, the whole init fails
      stderr.push(...genResult.stderr);
      stderr.push('Init failed: generate step failed.');
      return { exitCode: genResult.exitCode, stdout, stderr };
    }
    stdout.push(...genResult.stdout);
  } else if (!client) {
    stdout.push('Next steps:');
    stdout.push('  1. loxtep login');
    stdout.push('  2. loxtep init   (register platform project — or init --project-id <uuid>)');
    stdout.push('  3. loxtep attach --instance <instance-id>');
    if (templateSlug === 'shopify-orders') {
      stdout.push('  4. loxtep setup      # provision sample data products');
      stdout.push('  5. loxtep generate');
    } else {
      stdout.push('  4. loxtep generate');
    }
  } else if (!isAttached) {
    // Authed but not attached — print attach + generate guidance
    stdout.push('Next steps:');
    stdout.push('  1. loxtep attach --instance <instance-id>   # Instance bind (not link)');
    if (templateSlug === 'shopify-orders') {
      stdout.push('  2. loxtep setup      # provision orders_raw + orders_enriched (idempotent)');
      stdout.push('  3. loxtep generate');
    } else {
      stdout.push('  2. loxtep generate');
    }
    stdout.push('  (Existing cloud project without scaffold: `loxtep projects link <id>`)');
  } else if (templateSlug === 'shopify-orders') {
    stdout.push('Next: loxtep setup   ·   then loxtep generate → test → deploy');
  }

  return { exitCode: 0, stdout, stderr };
}
