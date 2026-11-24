/**
 * Workspace scope pin — project + attached Instance from `.loxtep/project.json`,
 * with optional Instance `environment_key` from the API.
 */

import { resolveEnvironmentKey } from '../client/instance-list-summary.js';
import type { LoxtepClient } from '../client/loxtep-client.js';
import { tryLoadProjectConfig } from './project-context.js';

export const WORKSPACE_CONTEXT_URI = 'loxtep://workspace_context';

export interface WorkspaceScopePin {
  project_id: string;
  organization_id: string | null;
  instance_id: string | null;
  environment_key: string | null;
  attached: boolean;
}

/** Build scope pin from cwd project.json; fetches Instance metadata when attached. */
export async function resolveWorkspaceScopePin(
  client: LoxtepClient,
  cwd: string
): Promise<WorkspaceScopePin | null> {
  const loaded = tryLoadProjectConfig(cwd);
  if (!loaded) return null;

  const { project } = loaded;
  const instanceId = project.instance_id?.trim() || null;
  const apiUrl = project.api_url?.trim() || null;
  const attached = !!(instanceId && apiUrl);

  let environment_key: string | null = null;
  if (instanceId) {
    try {
      const instance = await client.workspace.instances.get(instanceId);
      environment_key = resolveEnvironmentKey(instance);
    } catch {
      // Non-fatal — instance_id from project.json is still useful.
    }
  }

  return {
    project_id: project.project_id,
    organization_id: project.organization_id?.trim() || null,
    instance_id: instanceId,
    environment_key,
    attached,
  };
}

/** Human-readable lines for `loxtep whoami` / `loxtep status`. */
export function formatWorkspaceScopePinLines(pin: WorkspaceScopePin): string[] {
  const lines = ['Workspace scope:'];
  if (pin.organization_id) {
    lines.push(`  Organization id: ${pin.organization_id}`);
  }
  lines.push(`  Project id: ${pin.project_id}`);
  if (pin.attached && pin.instance_id) {
    lines.push(`  Instance id: ${pin.instance_id}`);
    lines.push(`  Instance environment_key: ${pin.environment_key ?? '(unset)'}`);
    lines.push(
      `  MCP: ${WORKSPACE_CONTEXT_URI}?project_id=${pin.project_id}&instance_id=${pin.instance_id}`
    );
    lines.push('  CLI attach must pin the same Instance as Studio.');
  } else {
    lines.push('  Instance: (not attached — run `loxtep attach --instance <id>`)');
    lines.push('  Pin the same Instance Studio uses for this project.');
  }
  return lines;
}