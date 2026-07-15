/**
 * Resolve API access token and optional api_url override for CLI.
 * Order: LOXTEP_AUTH_TOKEN → project-local `.loxtep/credentials.json` → ~/.loxtep/credentials.json.
 */

import { readCredentials, resolveCredentialsPath } from './credentials.js';

export type CliAuthSource = 'env' | 'credentials';

export interface ResolvedCliAuth {
  access_token: string;
  refresh_token?: string;
  /** When tokens came from credentials.json, use as api_url if config.api_url is empty. */
  api_url_from_mcp?: string;
  source: CliAuthSource;
  /** File the token was read from, when `source === 'credentials'` — used to persist refreshes back to the same file. */
  credentials_path?: string;
}

/**
 * Resolve bearer token for Loxtep API calls (CLI).
 */
export async function resolveCliAccessToken(options?: {
  credentialsPath?: string;
  cwd?: string;
}): Promise<ResolvedCliAuth | null> {
  const envTok = process.env.LOXTEP_AUTH_TOKEN?.trim();
  if (envTok) {
    return { access_token: envTok, source: 'env' };
  }
  const resolvedPath = options?.credentialsPath ?? resolveCredentialsPath(options?.cwd).path;
  const creds = await readCredentials(resolvedPath);
  if (creds?.access_token) {
    return {
      access_token: creds.access_token,
      refresh_token: creds.refresh_token,
      api_url_from_mcp: creds.api_base_url,
      source: 'credentials',
      credentials_path: resolvedPath,
    };
  }
  return null;
}
