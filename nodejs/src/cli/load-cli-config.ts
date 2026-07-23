/**
 * CLI config merge: ~/.loxtep/config.json + `.loxtep/project.json` workspace fields.
 * `loadConfig()` alone only reads the global config file; most CLI users set
 * project_id / instance_id / organization_id in the workspace via init + attach.
 */

import { loadConfig } from '../config/load.js';
import { resolveAutoConfig } from '../config/workspace-config.js';
import type { LoxtepConfig } from '../config/types.js';
import { mergeStreamsPartials } from '../config/streams-partial.js';

export interface LoadCliConfigOptions {
  configFilePath?: string;
  cwd?: string;
}

export interface LoadCliConfigResult {
  config: LoxtepConfig;
  /** Workspace api_url from `.loxtep/project.json` when set (often instance gateway from attach). */
  workspace_api_url?: string;
  resolvedWorkspaceFiles: string[];
  missingWorkspaceFiles: string[];
}

/**
 * Merge global config (`~/.loxtep/config.json` + env) with workspace project.json.
 * Precedence per field: env > ~/.loxtep/config.json > `.loxtep/project.json`.
 */
export async function loadCliConfig(
  options: LoadCliConfigOptions = {}
): Promise<LoadCliConfigResult> {
  const cwd = options.cwd ?? process.cwd();
  const base = await loadConfig(options.configFilePath);
  const auto = resolveAutoConfig(undefined, cwd);

  const config: LoxtepConfig = {
    ...base,
    organization_id: base.organization_id ?? auto.organization_id,
    project_id: base.project_id ?? auto.project_id,
    instance_id: base.instance_id ?? auto.instance_id,
    region: base.region ?? auto.region,
    streams: mergeStreamsPartials(base.streams, auto.streams),
  };

  return {
    config,
    workspace_api_url: auto.api_url,
    resolvedWorkspaceFiles: auto.resolvedFiles,
    missingWorkspaceFiles: auto.missingFiles,
  };
}
