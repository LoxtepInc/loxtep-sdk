import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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

/**
 * Resolve which credentials file to read from: a project-local
 * `<projectDir>/.loxtep/credentials.json` (found by walking up from `cwd`, same
 * search as `.loxtep/project.json`) takes precedence over the global
 * `~/.loxtep/credentials.json`. Falls back to global when no local credentials
 * file exists, even if a project directory was found — e.g. a project was
 * scaffolded/attached but `loxtep login` was never run locally in it.
 */
export function resolveCredentialsPath(cwd: string = process.cwd()): ResolvedCredentialsPath {
  const projectDir = findProjectDir(cwd);
  if (projectDir) {
    const localPath = getLocalCredentialsPath(projectDir);
    if (existsSync(localPath)) {
      return { path: localPath, scope: 'local', projectDir };
    }
  }
  return { path: getCredentialsPath(), scope: 'global', projectDir: projectDir ?? undefined };
}

/**
 * Resolve where `loxtep login` should write credentials: local to the current
 * project (if one is found upward from `cwd`) unless `forceScope` says
 * otherwise. Unlike {@link resolveCredentialsPath}, this doesn't require the
 * local file to already exist — it's the write target, not the read fallback.
 */
export function resolveCredentialsWriteTarget(
  cwd: string = process.cwd(),
  forceScope?: CredentialsScope
): ResolvedCredentialsPath {
  const projectDir = findProjectDir(cwd) ?? undefined;
  if (forceScope === 'global') {
    return { path: getCredentialsPath(), scope: 'global', projectDir };
  }
  if (forceScope === 'local') {
    if (!projectDir) {
      throw new Error(
        'No .loxtep/project.json found in this directory or any parent — cannot scope credentials locally. Run `loxtep init` first, or use --global.'
      );
    }
    return { path: getLocalCredentialsPath(projectDir), scope: 'local', projectDir };
  }
  if (projectDir) {
    return { path: getLocalCredentialsPath(projectDir), scope: 'local', projectDir };
  }
  return { path: getCredentialsPath(), scope: 'global', projectDir };
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
