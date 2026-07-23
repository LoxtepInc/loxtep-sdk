/**
 * Project-local workspace context for the `loxtep` CLI lifecycle commands.
 *
 * Resolves `.loxtep/project.json` from the working directory upward and enforces
 * the command-ordering preconditions shared by `generate` / `test` / `deploy`
 * (and surfaced by `attach` / `init` / `improvements apply`):
 *
 *   - {@link requireProject} fails with `NO_PROJECT` (R1.7) → "run loxtep init first".
 *   - {@link requireAttachedProject} fails with `NOT_ATTACHED` (R1.10) →
 *     "run loxtep attach first" when `instance_id`/`api_url` are not yet resolved.
 *
 * Writes go through the atomic build-validate-write-once {@link writeProjectConfig}
 * helper used by `attach` / `generate` / `improvements apply`, so a failed command
 * leaves the prior `.loxtep/project.json` bytes intact (R1.9, R17.2).
 *
 * All field names are snake_case per backend conventions.
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, parse as parsePath } from 'node:path';
import { z } from 'zod';
import { ValidationError } from '../errors/validation.js';
import type { FieldError } from '../errors/types.js';

/** Workspace config directory name: `.loxtep`. */
export const PROJECT_DIR_NAME = '.loxtep';
/** Workspace project file name: `project.json`. */
export const PROJECT_FILE_NAME = 'project.json';

/**
 * GitHub Project_Repository binding projected into `.loxtep/project.json` by
 * `loxtep attach` when the project record is bound to a repository (R17.2).
 * Absent entirely when the project is unbound (R17.3).
 */
export interface ProjectRepository {
  /** Bound repository URL (`github_repo_url`). */
  url: string;
  /** Bound repository name (`github_repo_name`). */
  name: string;
  /** Optional subpath within the repository (`github_repo_path`). */
  subpath?: string;
  /** Bound branch (`github_repo_branch`); defaults to `main` when unspecified (R17.1). */
  branch: string;
}

/**
 * Contents of `.loxtep/project.json`. `instance_id`/`api_url` are present only
 * after a successful `loxtep attach`; `repository` is present only when the
 * project is bound to a Project_Repository.
 */
export interface ProjectConfig {
  /** Loxtep project identifier (required). */
  project_id: string;
  /** Owning organization identifier (optional). */
  organization_id?: string;
  /** Resolved Instance identifier; written by `attach`. */
  instance_id?: string;
  /** Resolved API base URL; written by `attach`. */
  api_url?: string;
  /** Template slug the project was scaffolded from, when applicable. */
  template_slug?: string;
  /** GitHub binding projection; present only for repo-bound projects (R17.2). */
  repository?: ProjectRepository;
}

const ProjectRepositorySchema = z.object({
  url: z.string().min(1, 'repository.url is required'),
  name: z.string().min(1, 'repository.name is required'),
  subpath: z.string().optional(),
  // Branch defaults to `main` when unspecified (R17.1).
  branch: z.string().min(1).default('main'),
});

/** zod schema for `.loxtep/project.json`. Unknown keys are stripped on parse. */
export const ProjectConfigSchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  organization_id: z.string().min(1).optional(),
  instance_id: z.string().min(1).optional(),
  api_url: z.string().min(1).optional(),
  template_slug: z.string().min(1).optional(),
  repository: ProjectRepositorySchema.optional(),
});

/**
 * A precondition failure for a lifecycle command. The thin `main()` maps each to
 * a non-zero {@link CliResult.exitCode} and the message to stderr.
 */
export type PreconditionFailure =
  | { code: 'NO_PROJECT'; message: string } // → "run loxtep init first", exit 1
  | { code: 'NOT_ATTACHED'; message: string }; // → "run loxtep attach first", exit 1

/**
 * The structured result every lifecycle command returns. `main()` maps
 * `exitCode` to `process.exitCode`, making precondition and error-path
 * requirements (R1.7–R1.11, R2.8) unit-testable without spawning processes.
 */
export interface CliResult {
  /** Process exit code: 0 on success, non-zero on failure. */
  exitCode: number;
  /** Lines written to standard output. */
  stdout: string[];
  /** Lines written to standard error. */
  stderr: string[];
}

/** Guidance message for a missing project (R1.7). */
const NO_PROJECT_MESSAGE =
  'No .loxtep/project.json found in this directory or any parent. Run `loxtep init` first.';
/** Guidance message for an unattached project (R1.10). */
const NOT_ATTACHED_MESSAGE =
  'Project is not attached to an Instance (missing instance_id/api_url). Run `loxtep attach` first.';
/** Prefix for offline-only project ids written before platform registration existed. */
export const LOCAL_PROJECT_ID_PREFIX = 'proj_local_';

/** True when `project_id` was generated locally and never registered on the platform. */
export function isLocalProjectId(project_id: string): boolean {
  return project_id.startsWith(LOCAL_PROJECT_ID_PREFIX);
}

const LOCAL_PROJECT_MESSAGE =
  'Project is not registered on the platform (local-only project_id). Run `loxtep login` then `loxtep init` to register a platform project, or `loxtep init --project-id <uuid>` to bind an existing one.';

function noProjectFailure(message: string = NO_PROJECT_MESSAGE): PreconditionFailure {
  return { code: 'NO_PROJECT', message };
}

function notAttachedFailure(message: string = NOT_ATTACHED_MESSAGE): PreconditionFailure {
  return { code: 'NOT_ATTACHED', message };
}

/** Full path to `<projectDir>/.loxtep/project.json`. */
export function getProjectFilePath(projectDir: string): string {
  return join(projectDir, PROJECT_DIR_NAME, PROJECT_FILE_NAME);
}

/**
 * Walk from `cwd` upward to the filesystem root, returning the first directory
 * that contains a `.loxtep/project.json`, or `null` if none is found.
 */
export function findProjectDir(cwd: string): string | null {
  let dir = cwd;
  // Guard against an infinite loop: stop once `dirname` no longer changes (root).
  for (;;) {
    if (existsSync(getProjectFilePath(dir))) return dir;
    const parent = dirname(dir);
    if (parent === dir || parsePath(dir).root === dir) {
      // One last check at the root itself.
      if (existsSync(getProjectFilePath(parent))) return parent;
      return null;
    }
    dir = parent;
  }
}

export interface RequireProjectSuccess {
  ok: true;
  /** Directory that contains the `.loxtep/` folder. */
  projectDir: string;
  /** Full path to `.loxtep/project.json`. */
  projectFilePath: string;
  /** Parsed and validated project config. */
  project: ProjectConfig;
}

export interface RequireProjectFailure {
  ok: false;
  failure: PreconditionFailure;
}

export type RequireProjectResult = RequireProjectSuccess | RequireProjectFailure;

/**
 * Resolve and validate `.loxtep/project.json` searching from `cwd` upward.
 *
 * Returns `NO_PROJECT` (R1.7) when no project file exists in `cwd` or any parent,
 * or when the file cannot be parsed/validated as a project config.
 */
export function requireProject(cwd: string): RequireProjectResult {
  const projectDir = findProjectDir(cwd);
  if (!projectDir) {
    return { ok: false, failure: noProjectFailure() };
  }
  const projectFilePath = getProjectFilePath(projectDir);
  let raw: string;
  try {
    raw = readFileSync(projectFilePath, 'utf-8');
  } catch {
    return {
      ok: false,
      failure: noProjectFailure(
        `Found ${projectFilePath} but it could not be read. Run \`loxtep init\` first.`
      ),
    };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      failure: noProjectFailure(
        `${projectFilePath} is not valid JSON. Run \`loxtep init\` to recreate it.`
      ),
    };
  }
  const result = ProjectConfigSchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      failure: noProjectFailure(
        `${projectFilePath} is not a valid project config: ${summarizeIssues(result.error)}. Run \`loxtep init\` to recreate it.`
      ),
    };
  }
  if (isLocalProjectId(result.data.project_id)) {
    return {
      ok: false,
      failure: noProjectFailure(LOCAL_PROJECT_MESSAGE),
    };
  }
  return { ok: true, projectDir, projectFilePath, project: result.data };
}

export interface RequireAttachedProjectSuccess {
  ok: true;
  projectDir: string;
  projectFilePath: string;
  project: ProjectConfig & { instance_id: string; api_url: string };
}

export type RequireAttachedProjectResult = RequireAttachedProjectSuccess | RequireProjectFailure;

/**
 * Like {@link requireProject}, but additionally enforces that the project has
 * been attached: returns `NOT_ATTACHED` (R1.10) when `instance_id` or `api_url`
 * is missing. Used by `generate` / `test` / `deploy`.
 */
export function requireAttachedProject(cwd: string): RequireAttachedProjectResult {
  const base = requireProject(cwd);
  if (!base.ok) return base;
  const { project, projectDir, projectFilePath } = base;
  if (
    typeof project.instance_id !== 'string' ||
    project.instance_id.length === 0 ||
    typeof project.api_url !== 'string' ||
    project.api_url.length === 0
  ) {
    return { ok: false, failure: notAttachedFailure() };
  }
  return {
    ok: true,
    projectDir,
    projectFilePath,
    project: { ...project, instance_id: project.instance_id, api_url: project.api_url },
  };
}

/** Map a {@link PreconditionFailure} to a non-zero {@link CliResult}. */
export function preconditionToCliResult(failure: PreconditionFailure): CliResult {
  return { exitCode: 1, stdout: [], stderr: [failure.message] };
}

/**
 * Atomic build-validate-write-once writer for `.loxtep/project.json`.
 *
 * The caller builds the new config object in memory; this helper validates it
 * (throwing {@link ValidationError} before touching disk when invalid), then
 * writes it exactly once via a temp file + rename so a partial or failed write
 * leaves the prior file bytes unchanged (R1.9, R17.2). Used by
 * `attach` / `generate` / `improvements apply`.
 *
 * @returns the parsed config (with schema defaults applied, e.g. `repository.branch`).
 */
export async function writeProjectConfig(
  filePath: string,
  config: unknown
): Promise<ProjectConfig> {
  // 1. Validate the fully-built object before writing anything.
  const result = ProjectConfigSchema.safeParse(config);
  if (!result.success) {
    throw new ValidationError(
      'Invalid .loxtep/project.json contents',
      issuesToFieldErrors(result.error)
    );
  }
  const validated = result.data;
  const serialized = JSON.stringify(validated, null, 2);

  // 2. Write once, atomically: temp file in the target directory, then rename.
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = join(
    dir,
    `.${PROJECT_FILE_NAME}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  try {
    await writeFile(tmpPath, serialized, 'utf-8');
    await rename(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup so a failed write never leaves a stray temp file.
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
  return validated;
}

function issuesToFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map(issue => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

function summarizeIssues(error: z.ZodError): string {
  return issuesToFieldErrors(error)
    .map(fe => `${fe.field}: ${fe.message}`)
    .join('; ');
}
