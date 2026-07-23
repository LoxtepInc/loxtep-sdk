/**
 * Resolve the API host for CLI calls.
 * Browser login stores `api_base_url` in credentials — that must win over the
 * baked-in production default when the user has not set api_url in config/env.
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
 * Precedence: LOXTEP_API_URL → explicit config file api_url → credentials api_base_url → config default.
 */
export function resolveCliApiUrl(
  config: LoxtepConfig,
  resolved: ResolvedCliAuth | null,
  options?: { configFilePath?: string }
): string {
  const env = process.env.LOXTEP_API_URL?.trim();
  if (env) return env.replace(/\/$/, '');

  if (configFileHasExplicitApiUrl(options?.configFilePath) && config.api_url) {
    return config.api_url.replace(/\/$/, '');
  }

  if (resolved?.api_url_from_mcp) {
    return resolved.api_url_from_mcp.replace(/\/$/, '');
  }

  return (config.api_url || '').replace(/\/$/, '');
}
