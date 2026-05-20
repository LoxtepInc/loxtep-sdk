import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LoxtepConfig } from './types.js';
import { getDefaultConfigPath } from './paths.js';

/**
 * Save config to file. Writes api_url, organization_id, project_id, instance_id (when set).
 * No secrets (token) are ever written; token stays in memory only.
 */
export async function saveConfig(config: Partial<LoxtepConfig>, filePath?: string): Promise<void> {
  const path = filePath ?? getDefaultConfigPath();
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const payload: Record<string, unknown> = {
    api_url: config.api_url,
    auth_path_prefix: config.auth_path_prefix,
    api_path_prefix: config.api_path_prefix,
    organization_id: config.organization_id,
    project_id: config.project_id,
    instance_id: config.instance_id,
    region: config.region,
    ...(config.streams && Object.keys(config.streams).length > 0
      ? { streams: config.streams }
      : {}),
  };
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf-8');
}
