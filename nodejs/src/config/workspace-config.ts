/**
 * Workspace-aware config resolution for the SDK auto-config feature (R13).
 *
 * Resolution precedence: env vars > explicit config > `.loxtep/project.json` + `~/.loxtep/credentials.json`.
 *
 * This module provides:
 * - {@link loadWorkspaceConfig} — resolves config from workspace files (project.json + credentials.json)
 * - {@link resolveAutoConfig} — merges all layers (env, explicit, workspace) following the precedence
 * - {@link WorkspaceConfigResult} — the resolved config with metadata about which files were used
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectDir, getProjectFilePath, PROJECT_DIR_NAME, PROJECT_FILE_NAME } from '../cli/project-context.js';
import { resolveCredentialsPath } from '../cli/credentials.js';
import type { ConfigurationResources } from '../rstreams/leo-runtime.js';
import { parseStreamsPartial } from './streams-partial.js';

/**
 * Fields that auto-config resolves from workspace files.
 */
export interface WorkspaceResolvedFields {
  api_url?: string;
  organization_id?: string;
  project_id?: string;
  instance_id?: string;
  region?: string;
  streams?: Partial<ConfigurationResources>;
  token?: string;
}

/**
 * Result of loading workspace config, including which files were found.
 */
export interface WorkspaceConfigResult {
  /** Resolved fields from workspace files. */
  fields: WorkspaceResolvedFields;
  /** Files that were found and used. */
  resolvedFiles: string[];
  /** Files that were looked for but missing. */
  missingFiles: string[];
}

/**
 * Load workspace-resolved configuration from `.loxtep/project.json` (local project)
 * and credentials — project-local `.loxtep/credentials.json` if present, else
 * `~/.loxtep/credentials.json` (see {@link resolveCredentialsPath}).
 *
 * This does NOT check env vars or explicit config — it only resolves from files.
 * The caller is responsible for merging with the correct precedence.
 *
 * @param cwd - The working directory to search from (defaults to `process.cwd()`).
 * @returns Resolved fields and metadata about which files were used.
 */
export function loadWorkspaceConfig(cwd?: string): WorkspaceConfigResult {
  const workDir = cwd ?? process.cwd();
  const resolvedFiles: string[] = [];
  const missingFiles: string[] = [];
  const fields: WorkspaceResolvedFields = {};

  // 1. Resolve .loxtep/project.json (search upward from cwd)
  const projectDir = findProjectDir(workDir);
  const projectFilePath = projectDir ? getProjectFilePath(projectDir) : null;

  if (projectFilePath && existsSync(projectFilePath)) {
    try {
      const raw = readFileSync(projectFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed === 'object' && parsed !== null) {
        if (typeof parsed.api_url === 'string' && parsed.api_url.trim()) {
          fields.api_url = parsed.api_url.trim();
        }
        if (typeof parsed.organization_id === 'string' && parsed.organization_id.trim()) {
          fields.organization_id = parsed.organization_id.trim();
        }
        if (typeof parsed.project_id === 'string' && parsed.project_id.trim()) {
          fields.project_id = parsed.project_id.trim();
        }
        if (typeof parsed.instance_id === 'string' && parsed.instance_id.trim()) {
          fields.instance_id = parsed.instance_id.trim();
        }
        if (typeof parsed.region === 'string' && parsed.region.trim()) {
          fields.region = parsed.region.trim();
        }
        const streams = parseStreamsPartial(parsed.streams);
        if (streams) {
          fields.streams = streams;
        }
      }
      resolvedFiles.push(projectFilePath);
    } catch {
      // File exists but can't be read/parsed — treat as missing
      missingFiles.push(projectFilePath);
    }
  } else {
    // Project file not found in any parent directory
    const searchedPath = join(workDir, PROJECT_DIR_NAME, PROJECT_FILE_NAME);
    missingFiles.push(searchedPath);
  }

  // 2. Resolve credentials.json — project-local first, else ~/.loxtep/credentials.json
  const credentialsPath = resolveCredentialsPath(workDir).path;

  if (existsSync(credentialsPath)) {
    try {
      const raw = readFileSync(credentialsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed === 'object' && parsed !== null) {
        if (typeof parsed.access_token === 'string' && parsed.access_token.trim()) {
          fields.token = parsed.access_token.trim();
        }
        // credentials.json can also carry api_base_url (from login)
        if (
          !fields.api_url &&
          typeof parsed.api_base_url === 'string' &&
          parsed.api_base_url.trim()
        ) {
          fields.api_url = parsed.api_base_url.trim();
        }
      }
      resolvedFiles.push(credentialsPath);
    } catch {
      // File exists but can't be read/parsed — treat as missing
      missingFiles.push(credentialsPath);
    }
  } else {
    missingFiles.push(credentialsPath);
  }

  return { fields, resolvedFiles, missingFiles };
}

/**
 * Options that can be explicitly passed to override auto-resolved config.
 */
export interface ExplicitConfigFields {
  api_url?: string;
  organization_id?: string;
  project_id?: string;
  instance_id?: string;
  region?: string;
  streams?: Partial<ConfigurationResources>;
  token?: string;
}

/**
 * Env var names that take precedence over everything.
 */
const ENV_ORGANIZATION_ID = 'LOXTEP_ORGANIZATION_ID';
const ENV_API_URL = 'LOXTEP_API_URL';
const ENV_PROJECT_ID = 'LOXTEP_PROJECT_ID';
const ENV_INSTANCE_ID = 'LOXTEP_INSTANCE_ID';
const ENV_REGION = 'LOXTEP_REGION';
const ENV_TOKEN = 'LOXTEP_TOKEN';

/**
 * Resolved auto-config result with full precedence applied.
 */
export interface AutoConfigResult {
  /** Final resolved api_url. */
  api_url?: string;
  /** Final resolved organization_id. */
  organization_id?: string;
  /** Final resolved project_id. */
  project_id?: string;
  /** Final resolved instance_id. */
  instance_id?: string;
  /** Final resolved AWS / stream bus region. */
  region?: string;
  /** Stream bus resource names from workspace project.json. */
  streams?: Partial<ConfigurationResources>;
  /** Final resolved auth token. */
  token?: string;
  /** Files that were resolved (for debug log). */
  resolvedFiles: string[];
  /** Files that were missing. */
  missingFiles: string[];
}

/**
 * Resolve configuration with full precedence: env > explicit > workspace files.
 *
 * @param explicit - Explicitly passed config (overrides workspace but not env).
 * @param cwd - Working directory to search for `.loxtep/project.json`.
 * @returns The merged config with metadata about resolution sources.
 */
export function resolveAutoConfig(
  explicit?: ExplicitConfigFields,
  cwd?: string
): AutoConfigResult {
  // Layer 1: workspace files (lowest precedence)
  const workspace = loadWorkspaceConfig(cwd);

  // Layer 2: explicit config (overrides workspace)
  const afterExplicit: WorkspaceResolvedFields = {
    api_url: explicit?.api_url || workspace.fields.api_url,
    organization_id: explicit?.organization_id || workspace.fields.organization_id,
    project_id: explicit?.project_id || workspace.fields.project_id,
    instance_id: explicit?.instance_id || workspace.fields.instance_id,
    region: explicit?.region || workspace.fields.region,
    streams: explicit?.streams || workspace.fields.streams,
    token: explicit?.token || workspace.fields.token,
  };

  // Layer 3: env vars (highest precedence)
  const envApiUrl = process.env[ENV_API_URL]?.trim() || undefined;
  const envOrganizationId = process.env[ENV_ORGANIZATION_ID]?.trim() || undefined;
  const envProjectId = process.env[ENV_PROJECT_ID]?.trim() || undefined;
  const envInstanceId = process.env[ENV_INSTANCE_ID]?.trim() || undefined;
  const envRegion = process.env[ENV_REGION]?.trim() || undefined;
  const envToken = process.env[ENV_TOKEN]?.trim() || undefined;

  return {
    api_url: envApiUrl || afterExplicit.api_url,
    organization_id: envOrganizationId || afterExplicit.organization_id,
    project_id: envProjectId || afterExplicit.project_id,
    instance_id: envInstanceId || afterExplicit.instance_id,
    region: envRegion || afterExplicit.region,
    streams: afterExplicit.streams,
    token: envToken || afterExplicit.token,
    resolvedFiles: workspace.resolvedFiles,
    missingFiles: workspace.missingFiles,
  };
}
