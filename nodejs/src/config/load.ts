import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import type { LoxtepConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { getDefaultConfigPath } from './paths.js';
import type { ConfigurationResources } from '../rstreams/leo-runtime.js';
import { mergeStreamsPartials, parseStreamsPartial } from './streams-partial.js';

const ENV_API_URL = 'LOXTEP_API_URL';
const ENV_AUTH_PATH_PREFIX = 'LOXTEP_AUTH_PATH_PREFIX';
const ENV_API_PATH_PREFIX = 'LOXTEP_API_PATH_PREFIX';
const ENV_ORGANIZATION_ID = 'LOXTEP_ORGANIZATION_ID';
const ENV_PROJECT_ID = 'LOXTEP_PROJECT_ID';
const ENV_INSTANCE_ID = 'LOXTEP_INSTANCE_ID';
const ENV_REGION = 'LOXTEP_REGION';
/** Path to a JSON file with the same shape as the main config `streams` key (PascalCase). Merged on top of `streams` from the primary config file. */
const ENV_RSTREAMS_CONFIG_FILE = 'LOXTEP_RSTREAMS_CONFIG_FILE';

function readStreamsFromRstreamsFileSync(): Partial<ConfigurationResources> | undefined {
  const p = process.env[ENV_RSTREAMS_CONFIG_FILE]?.trim();
  if (!p || !existsSync(p)) return undefined;
  try {
    const raw = readFileSync(p, 'utf-8');
    return parseStreamsPartial(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

async function readStreamsFromRstreamsFileAsync(): Promise<
  Partial<ConfigurationResources> | undefined
> {
  const p = process.env[ENV_RSTREAMS_CONFIG_FILE]?.trim();
  if (!p || !existsSync(p)) return undefined;
  try {
    const raw = String(await readFile(p, 'utf-8'));
    return parseStreamsPartial(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/**
 * Load config from env and optional file. Precedence: env > file > defaults.
 * No secrets (token) are read; token is in memory only.
 */
export async function loadConfig(filePath?: string): Promise<LoxtepConfig> {
  const path = filePath ?? getDefaultConfigPath();
  let fileConfig: Partial<LoxtepConfig> = {};

  if (existsSync(path)) {
    try {
      const raw = String(await readFile(path, 'utf-8'));
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed === 'object' && parsed !== null) {
        fileConfig = {
          api_url: typeof parsed.api_url === 'string' ? parsed.api_url : undefined,
          auth_path_prefix:
            typeof parsed.auth_path_prefix === 'string' ? parsed.auth_path_prefix : undefined,
          api_path_prefix:
            typeof parsed.api_path_prefix === 'string' ? parsed.api_path_prefix : undefined,
          organization_id:
            typeof parsed.organization_id === 'string' ? parsed.organization_id : undefined,
          project_id: typeof parsed.project_id === 'string' ? parsed.project_id : undefined,
          instance_id: typeof parsed.instance_id === 'string' ? parsed.instance_id : undefined,
          region: typeof parsed.region === 'string' ? parsed.region : undefined,
          streams: parseStreamsPartial(parsed.streams),
        };
      }
    } catch {
      // Ignore invalid or unreadable file; fall back to env/defaults
    }
  }

  const rstreamsFilePartial = await readStreamsFromRstreamsFileAsync();
  const streamsMerged = mergeStreamsPartials(fileConfig.streams, rstreamsFilePartial);

  const envConfig: Partial<LoxtepConfig> = {
    api_url: process.env[ENV_API_URL]?.trim() || undefined,
    auth_path_prefix:
      process.env[ENV_AUTH_PATH_PREFIX] !== undefined
        ? process.env[ENV_AUTH_PATH_PREFIX]!.replace(/^\/+|\/+$/g, '')
        : undefined,
    api_path_prefix:
      process.env[ENV_API_PATH_PREFIX] !== undefined
        ? process.env[ENV_API_PATH_PREFIX]!.replace(/^\/+|\/+$/g, '')
        : undefined,
    organization_id: process.env[ENV_ORGANIZATION_ID]?.trim() || undefined,
    project_id: process.env[ENV_PROJECT_ID]?.trim() || undefined,
    instance_id: process.env[ENV_INSTANCE_ID]?.trim() || undefined,
    region: process.env[ENV_REGION]?.trim() || undefined,
  };

  return {
    api_url: envConfig.api_url ?? fileConfig.api_url ?? DEFAULT_CONFIG.api_url,
    auth_path_prefix: envConfig.auth_path_prefix ?? fileConfig.auth_path_prefix,
    api_path_prefix: envConfig.api_path_prefix ?? fileConfig.api_path_prefix,
    organization_id:
      envConfig.organization_id ?? fileConfig.organization_id ?? DEFAULT_CONFIG.organization_id,
    project_id: envConfig.project_id ?? fileConfig.project_id ?? DEFAULT_CONFIG.project_id,
    instance_id: envConfig.instance_id ?? fileConfig.instance_id ?? DEFAULT_CONFIG.instance_id,
    region: envConfig.region ?? fileConfig.region ?? DEFAULT_CONFIG.region,
    streams: streamsMerged,
  };
}

/**
 * Load config synchronously from env and optional file. Precedence: env > file > defaults.
 * Uses readFileSync for file; prefer loadConfig() in async code.
 */
export function loadConfigSync(filePath?: string): LoxtepConfig {
  const path = filePath ?? getDefaultConfigPath();
  let fileConfig: Partial<LoxtepConfig> = {};

  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed === 'object' && parsed !== null) {
        fileConfig = {
          api_url: typeof parsed.api_url === 'string' ? parsed.api_url : undefined,
          auth_path_prefix:
            typeof parsed.auth_path_prefix === 'string' ? parsed.auth_path_prefix : undefined,
          api_path_prefix:
            typeof parsed.api_path_prefix === 'string' ? parsed.api_path_prefix : undefined,
          organization_id:
            typeof parsed.organization_id === 'string' ? parsed.organization_id : undefined,
          project_id: typeof parsed.project_id === 'string' ? parsed.project_id : undefined,
          instance_id: typeof parsed.instance_id === 'string' ? parsed.instance_id : undefined,
          region: typeof parsed.region === 'string' ? parsed.region : undefined,
          streams: parseStreamsPartial(parsed.streams),
        };
      }
    } catch {
      // Ignore invalid or unreadable file
    }
  }

  const rstreamsFilePartial = readStreamsFromRstreamsFileSync();
  const streamsMerged = mergeStreamsPartials(fileConfig.streams, rstreamsFilePartial);

  const envConfig: Partial<LoxtepConfig> = {
    api_url: process.env[ENV_API_URL]?.trim() || undefined,
    auth_path_prefix:
      process.env[ENV_AUTH_PATH_PREFIX] !== undefined
        ? process.env[ENV_AUTH_PATH_PREFIX]!.replace(/^\/+|\/+$/g, '')
        : undefined,
    api_path_prefix:
      process.env[ENV_API_PATH_PREFIX] !== undefined
        ? process.env[ENV_API_PATH_PREFIX]!.replace(/^\/+|\/+$/g, '')
        : undefined,
    organization_id: process.env[ENV_ORGANIZATION_ID]?.trim() || undefined,
    project_id: process.env[ENV_PROJECT_ID]?.trim() || undefined,
    instance_id: process.env[ENV_INSTANCE_ID]?.trim() || undefined,
    region: process.env[ENV_REGION]?.trim() || undefined,
  };

  return {
    api_url: envConfig.api_url ?? fileConfig.api_url ?? DEFAULT_CONFIG.api_url,
    auth_path_prefix: envConfig.auth_path_prefix ?? fileConfig.auth_path_prefix,
    api_path_prefix: envConfig.api_path_prefix ?? fileConfig.api_path_prefix,
    organization_id:
      envConfig.organization_id ?? fileConfig.organization_id ?? DEFAULT_CONFIG.organization_id,
    project_id: envConfig.project_id ?? fileConfig.project_id ?? DEFAULT_CONFIG.project_id,
    instance_id: envConfig.instance_id ?? fileConfig.instance_id ?? DEFAULT_CONFIG.instance_id,
    region: envConfig.region ?? fileConfig.region ?? DEFAULT_CONFIG.region,
    streams: streamsMerged,
  };
}
