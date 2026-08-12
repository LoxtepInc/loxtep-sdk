/**
 * Resolve the API host for CLI calls.
 * Browser login stores `api_base_url` in credentials — that must win over a
 * stale ~/.loxtep/config.json api_url (commonly left on production) because the
 * access token is minted for a specific host.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { LoxtepConfig } from '../config/types.js';
import { getDefaultConfigPath } from '../config/paths.js';
import type { ResolvedCliAuth } from './auth-resolve.js';

/** True when ~/.loxtep/config.json (or override path) explicitly sets api_url. */
export function configFileHasExplicitApiUrl(configFilePath?: string): boolean {
  const path = configFilePath ?? getDefaultConfigPath();
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    return typeof parsed.api_url === 'string' && parsed.api_url.trim() !== '';
  } catch {
    return false;
  }
}

/**
 * Precedence: LOXTEP_API_URL → credentials api_base_url → explicit config file api_url → config default.
 *
 * Credentials win over config because tokens are host-bound (e.g. apidev CLISESS JWT
 * must not be sent to api.loxtep.io just because config still points at prod).
 */
export function resolveCliApiUrl(
  config: LoxtepConfig,
  resolved: ResolvedCliAuth | null,
  options?: { configFilePath?: string }
): string {
  const env = process.env.LOXTEP_API_URL?.trim();
  if (env) return env.replace(/\/$/, '');

  if (resolved?.api_url_from_mcp) {
    return resolved.api_url_from_mcp.replace(/\/$/, '');
  }

  if (configFileHasExplicitApiUrl(options?.configFilePath) && config.api_url) {
    return config.api_url.replace(/\/$/, '');
  }

  return (config.api_url || '').replace(/\/$/, '');
}
