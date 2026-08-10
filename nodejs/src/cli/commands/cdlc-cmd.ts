/**
 * CLI: loxtep cdlc transition|review-queue
 *
 * Steward-critical CDLC paths on `client.review.cdlc`:
 * - transition_lifecycle
 * - list_review_queue
 *
 * Does not require an attached project.
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { LifecycleState } from '../../client/cdlc-types.js';
import type { CliResult } from '../project-context.js';

const LIFECYCLE_STATES: LifecycleState[] = [
  'draft',
  'in_review',
  'approved',
  'deployed',
  'retired',
];

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

function isLifecycleState(value: string): value is LifecycleState {
  return (LIFECYCLE_STATES as string[]).includes(value);
}

export async function runCdlcTransitionCommand(
  client: LoxtepClient,
  artifact_ref: string,
  options: {
    from?: string;
    to?: string;
    organization_id?: string;
    actor?: string;
    owner?: string;
  }
): Promise<CliResult> {
  if (!artifact_ref) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['artifact_ref is required (format: artifact_type:id).'],
    };
  }
  if (!options.from || !options.to) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Both --from and --to are required. Valid states: ${LIFECYCLE_STATES.join(', ')}.`,
      ],
    };
  }
  if (!isLifecycleState(options.from) || !isLifecycleState(options.to)) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Invalid lifecycle state. Valid states: ${LIFECYCLE_STATES.join(', ')}.`,
      ],
    };
  }

  const org = await resolveOrganizationId(client, options.organization_id);
  if (!org.ok) {
    return { exitCode: 1, stdout: [], stderr: [org.error] };
  }

  try {
    const result = await client.review.cdlc.transition_lifecycle({
      artifact_ref,
      current_state: options.from,
      target_state: options.to,
      organization_id: org.organization_id,
      ...(options.actor ? { actor: options.actor } : {}),
      ...(options.owner ? { owner: options.owner } : {}),
    });
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to transition lifecycle: ${message}`] };
  }
}

export async function runCdlcReviewQueueCommand(
  client: LoxtepClient,
  options?: { organization_id?: string; domain_id?: string }
): Promise<CliResult> {
  const org = await resolveOrganizationId(client, options?.organization_id);
  if (!org.ok) {
    return { exitCode: 1, stdout: [], stderr: [org.error] };
  }

  try {
    const result = await client.review.cdlc.list_review_queue({
      organization_id: org.organization_id,
      ...(options?.domain_id ? { domain_id: options.domain_id } : {}),
    });
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to list review queue: ${message}`] };
  }
}
