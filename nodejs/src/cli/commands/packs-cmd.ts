/**
 * CLI: loxtep packs list|activate|status
 *
 * SDK/MCP parity for vocabulary pack lifecycle (`client.meaning.packs` /
 * loxtep_meaning semantic-layer ops). Does not require an attached project.
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { CliResult } from '../project-context.js';

async function resolveOrganizationId(
  client: LoxtepClient,
  override?: string
): Promise<{ ok: true; organization_id: string } | { ok: false; error: string }> {
  if (override) {
    return { ok: true, organization_id: override };
  }
  try {
    const user = await client.session.get_current_user();
    if (user.organization_id) {
      return { ok: true, organization_id: user.organization_id };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to resolve organization_id: ${message}` };
  }
  return {
    ok: false,
    error:
      'organization_id is required. Set it in .loxtep/project.json or pass --organization-id <id>.',
  };
}

export async function runPacksListCommand(client: LoxtepClient): Promise<CliResult> {
  try {
    const result = await client.meaning.packs.list_available();
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to list available packs: ${message}`] };
  }
}

export async function runPacksActivateCommand(
  client: LoxtepClient,
  pack_id: string,
  options?: { organization_id?: string }
): Promise<CliResult> {
  if (!pack_id) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['pack_id is required. Usage: loxtep packs activate <pack_id>'],
    };
  }

  const org = await resolveOrganizationId(client, options?.organization_id);
  if (!org.ok) {
    return { exitCode: 1, stdout: [], stderr: [org.error] };
  }

  try {
    const result = await client.meaning.packs.activate({
      pack_id,
      organization_id: org.organization_id,
    });
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to activate pack: ${message}`] };
  }
}

export async function runPacksStatusCommand(client: LoxtepClient): Promise<CliResult> {
  try {
    const result = await client.meaning.packs.get_activation_status();
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Failed to get pack activation status: ${message}`],
    };
  }
}
