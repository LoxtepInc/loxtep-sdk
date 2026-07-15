import {
  deleteCredentials,
  resolveCredentialsPath,
  getCredentialsPath,
  getLocalCredentialsPath,
  type CredentialsScope,
} from '../credentials.js';
import { findProjectDir } from '../project-context.js';

export interface LogoutOptions {
  /** Force scope instead of the default local-first resolution. */
  scope?: CredentialsScope;
  /** Working directory used to resolve the project for local scoping (default: `process.cwd()`). */
  cwd?: string;
}

/**
 * Run logout: remove stored credentials file. By default removes whichever
 * credentials are currently active for `cwd` (project-local if present, else
 * global) — same resolution used to authenticate. Pass `scope` to force
 * removing the local or global file specifically.
 */
export async function runLogout(options: LogoutOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  if (options.scope === 'global') {
    const path = getCredentialsPath();
    await deleteCredentials(path);
    console.log(`Logged out (global: ${path}).`);
    return;
  }

  if (options.scope === 'local') {
    const projectDir = findProjectDir(cwd);
    if (!projectDir) {
      console.error(
        'No .loxtep/project.json found in this directory or any parent — nothing local to log out of.'
      );
      process.exitCode = 1;
      return;
    }
    const path = getLocalCredentialsPath(projectDir);
    await deleteCredentials(path);
    console.log(`Logged out (local: ${path}).`);
    return;
  }

  const target = resolveCredentialsPath(cwd);
  await deleteCredentials(target.path);
  console.log(`Logged out (${target.scope}: ${target.path}).`);
}
