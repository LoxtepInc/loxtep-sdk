/**
 * `loxtep init [--template <slug>] [--project-id <uuid>] [--create-repo|--from-repo]`
 *
 * Scaffolds a new Loxtep project:
 *   - `.loxtep/project.json` + `domains/` + `connectors/` + `workflows/` + `data-products/`
 *   - Requires authentication to register (or bind) a platform project — no silent
 *     `proj_local_*` ids that break API commands later.
 *   - `--project-id <uuid>` binds an existing org project instead of creating one.
 *   - Re-running `init` after login upgrades a stale local-only `project_id`.
 *   - With `--template <slug>`: resolves from the catalog and materializes full
 *     structure incl. `AGENTS.md` + default `.loxtep/skills/<slug>.yaml`.
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
import { mkdir, writeFile } from 'node:fs/promises';
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
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { TemplateSummary } from '../../client/templates-types.js';
import type { CreateProjectInput } from '../../client/projects-types.js';

/* ------------------------------------------------------------------ */
/*  Doc links (R11.7)                                                  */
/* ------------------------------------------------------------------ */

const GETTING_STARTED_URL = 'https://docs.loxtep.io/getting-started';
const QUICK_REFERENCE_URL = 'https://docs.loxtep.io/quick-reference';

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

function buildDefaultAgentsMd(templateSlug: string, template: TemplateSummary): string {
  return `# AGENTS.md — ${template.name || templateSlug}

This project was scaffolded from the \`${templateSlug}\` template.

## MCP tools

Connect to the Loxtep MCP server for full platform access:

\`\`\`json
{ "mcpServers": { "loxtep": { "url": "https://mcp.loxtep.io/ai/mcp/stream" } } }
\`\`\`

## SDK methods

- \`LoxtepClient.fromWorkspace()\` — auto-configure from \`.loxtep/project.json\`
- \`defineDataWorkflow({ name, triggers, handler })\` — code-first workflow authoring
- \`workspace.dataProducts.*\` / \`workspace.connectors.*\` — typed constants (after \`loxtep generate\`)

## Skill scope

Default skill: \`.loxtep/skills/${templateSlug}.yaml\`
`;
}

function buildDefaultSkillYaml(templateSlug: string): string {
  return `# Default skill for the ${templateSlug} template.
# Edit scope and permissions to match your project's resources.
name: ${templateSlug}
description: Default skill scope for the ${templateSlug} template
scope:
  data_products: []
  connectors: []
  workflows: []
  domains: []
  queues: []
permissions:
  data_products:
    - read
    - write
  connectors:
    - read
  workflows:
    - read
    - write
    - create
  domains:
    - read
  queues:
    - read
`;
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

  // --- Scaffold standard directories first (always) ---
  for (const dir of STANDARD_DIRS) {
    await ensureDir(join(cwd, dir));
  }

  const loxtepDir = join(cwd, PROJECT_DIR_NAME);
  await ensureDir(loxtepDir);

  const existing = readExistingProjectConfig(cwd);

  // --- Resolve template when requested (R1.2, R16.1, R16.2) ---
  let template: TemplateSummary | undefined;
  if (templateSlug && client) {
    try {
      // Try to find by slug search first; the catalog may return by id or name
      const templates = await client.connect.templates.list({ search: templateSlug });
      template = templates.items.find(
        (t) =>
          t.name === templateSlug ||
          t.template_id === templateSlug ||
          (t.metadata as Record<string, unknown>)?.slug === templateSlug
      );
      if (!template) {
        // Fallback: try direct get
        try {
          template = await client.connect.templates.get(templateSlug);
        } catch {
          // Could not resolve — proceed without template data but record the slug
        }
      }
    } catch {
      // Template lookup failed — proceed without template metadata; scaffold still happens
    }
  }

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

  // --- Template-specific scaffolding (R16.1, R16.2) ---
  if (templateSlug) {
    // AGENTS.md (R16.1)
    const agentsMdContent = template
      ? buildDefaultAgentsMd(templateSlug, template)
      : buildDefaultAgentsMd(templateSlug, {
          template_id: templateSlug,
          name: templateSlug,
          description: null,
          category: '',
          version: '1.0.0',
          configuration: {},
          validation_rules: {},
          metadata: {},
          is_public: true,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    await writeFile(join(cwd, 'AGENTS.md'), agentsMdContent, 'utf-8');

    // Default skill (.loxtep/skills/<slug>.yaml) (R16.2)
    const skillsDir = join(loxtepDir, 'skills');
    await ensureDir(skillsDir);
    await writeFile(
      join(skillsDir, `${templateSlug}.yaml`),
      buildDefaultSkillYaml(templateSlug),
      'utf-8'
    );
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
    stdout.push('  4. loxtep generate');
  } else if (!isAttached) {
    // Authed but not attached — print attach + generate guidance
    stdout.push('Next steps:');
    stdout.push('  1. loxtep attach --instance <instance-id>');
    stdout.push('  2. loxtep generate');
  }

  return { exitCode: 0, stdout, stderr };
}
