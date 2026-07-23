import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, parse as parsePath } from 'node:path';
import { getConfigDir } from '../config/paths.js';
import { findProjectDir, PROJECT_DIR_NAME } from './project-context.js';
import type { AwsCredentialsSnake } from '../auth/login.js';

export interface CliCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  /**
   * API base URL (e.g. https://apidev.loxtep.io), same as in ~/.loxtep/credentials.json
   * after `loxtep login`. Optional: config / env can supply api_url.
   */
  api_base_url?: string;
  /**
   * Temporary AWS credentials from the same login/refresh response as the JWT (Cognito / identity pool).
   * Used for API Gateway SigV4; same payload the browser session eventually uses after refresh.
   */
  aws_credentials?: AwsCredentialsSnake;
}

const CREDENTIALS_FILENAME = 'credentials.json';

/** Path to global CLI credentials file: ~/.loxtep/credentials.json. */
export function getCredentialsPath(): string {
  return join(getConfigDir(), CREDENTIALS_FILENAME);
}

/** Path to project-local credentials file: `<projectDir>/.loxtep/credentials.json`. */
export function getLocalCredentialsPath(projectDir: string): string {
  return join(projectDir, PROJECT_DIR_NAME, CREDENTIALS_FILENAME);
}

export type CredentialsScope = 'local' | 'global';

export interface ResolvedCredentialsPath {
  path: string;
  scope: CredentialsScope;
  /** Directory containing `.loxtep/project.json`, when one was found upward from `cwd`. */
  projectDir?: string;
}

/** Walk from `cwd` upward until `predicate(dir)` is true, or return null. */
function walkUpFrom(cwd: string, predicate: (dir: string) => boolean): string | null {
  let dir = cwd;
  for (;;) {
    if (predicate(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir || parsePath(dir).root === dir) {
      if (predicate(parent)) return parent;
      return null;
    }
    dir = parent;
  }
}

/**
 * First directory (from `cwd` upward) that contains `.loxtep/credentials.json`.
 */
export function findLocalCredentialsDir(cwd: string = process.cwd()): string | null {
  return walkUpFrom(cwd, dir => existsSync(getLocalCredentialsPath(dir)));
}

/**
 * Resolve which credentials file to read from: walk upward from `cwd` for
 * `.loxtep/credentials.json`, then fall back to `~/.loxtep/credentials.json`.
 */
export function resolveCredentialsPath(cwd: string = process.cwd()): ResolvedCredentialsPath {
  const localDir = findLocalCredentialsDir(cwd);
  if (localDir) {
    return { path: getLocalCredentialsPath(localDir), scope: 'local', projectDir: localDir };
  }
  return { path: getCredentialsPath(), scope: 'global', projectDir: findProjectDir(cwd) ?? undefined };
}

/**
 * Resolve where `loxtep login` should write credentials: `./.loxtep/credentials.json`
 * under `cwd` by default (or when `--local` is passed). Use `--global` for
 * `~/.loxtep/credentials.json`.
 */
export function resolveCredentialsWriteTarget(
  cwd: string = process.cwd(),
  forceScope?: CredentialsScope
): ResolvedCredentialsPath {
  if (forceScope === 'global') {
    return {
      path: getCredentialsPath(),
      scope: 'global',
      projectDir: findProjectDir(cwd) ?? undefined,
    };
  }
  return {
    path: getLocalCredentialsPath(cwd),
    scope: 'local',
    projectDir: cwd,
  };
}

/**
 * Idempotently add the local credentials file to `<projectDir>/.gitignore` so
 * project-scoped tokens are never committed alongside `.loxtep/project.json`.
 */
export async function ensureLocalCredentialsGitignored(projectDir: string): Promise<void> {
  const entry = `${PROJECT_DIR_NAME}/${CREDENTIALS_FILENAME}`;
  const gitignorePath = join(projectDir, '.gitignore');
  let existing = '';
  if (existsSync(gitignorePath)) {
    existing = String(await readFile(gitignorePath, 'utf-8'));
    if (existing.split('\n').some(line => line.trim() === entry)) return;
  }
  const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  await writeFile(gitignorePath, `${existing}${sep}${entry}\n`, 'utf-8');
}

/**
 * Read credentials from file. Defaults to the local-first resolution
 * ({@link resolveCredentialsPath}) when no explicit `filePath` is given.
 * Returns null if missing or invalid.
 */
export async function readCredentials(
  filePath?: string,
  cwd?: string
): Promise<CliCredentials | null> {
  const path = filePath ?? resolveCredentialsPath(cwd).path;
  if (!existsSync(path)) return null;
  try {
    const raw = String(await readFile(path, 'utf-8'));
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed?.access_token !== 'string') return null;
    const aws = parsed.aws_credentials;
    const awsOk =
      aws &&
      typeof aws === 'object' &&
      typeof (aws as AwsCredentialsSnake).access_key_id === 'string' &&
      typeof (aws as AwsCredentialsSnake).secret_access_key === 'string';
    return {
      access_token: parsed.access_token,
      refresh_token: typeof parsed.refresh_token === 'string' ? parsed.refresh_token : undefined,
      expires_at: typeof parsed.expires_at === 'string' ? parsed.expires_at : undefined,
      api_base_url:
        typeof parsed.api_base_url === 'string' && parsed.api_base_url.trim() !== ''
          ? parsed.api_base_url.replace(/\/$/, '')
          : undefined,
      aws_credentials: awsOk ? (aws as AwsCredentialsSnake) : undefined,
    };
  } catch {
    return null;
  }
}

/** Write credentials to file. Creates directory if needed. Merges with an existing file so optional fields (api_base_url, etc.) are not dropped. */
export async function writeCredentials(creds: CliCredentials, filePath?: string): Promise<void> {
  const path = filePath ?? getCredentialsPath();
  await mkdir(dirname(path), { recursive: true });
  const existing = await readCredentials(path);
  const merged: CliCredentials = {
    access_token: creds.access_token,
    refresh_token: creds.refresh_token ?? existing?.refresh_token,
    expires_at: creds.expires_at ?? existing?.expires_at,
    api_base_url: creds.api_base_url ?? existing?.api_base_url,
    aws_credentials: creds.aws_credentials ?? existing?.aws_credentials,
  };
  const payload: Record<string, unknown> = {
    access_token: merged.access_token,
    refresh_token: merged.refresh_token,
    expires_at: merged.expires_at,
  };
  if (merged.api_base_url) {
    payload.api_base_url = merged.api_base_url;
  }
  if (merged.aws_credentials) {
    payload.aws_credentials = merged.aws_credentials;
  }
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf-8');
}

/** Remove credentials file (logout). */
export async function deleteCredentials(filePath?: string): Promise<void> {
  const path = filePath ?? getCredentialsPath();
  if (existsSync(path)) await rm(path);
}
