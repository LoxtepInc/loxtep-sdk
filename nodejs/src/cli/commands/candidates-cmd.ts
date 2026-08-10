/**
 * CLI: loxtep candidates list|act
 *
 * Context-mining candidates on `client.review.mining`:
 * - list_candidates
 * - act_on_candidate (approve → CDLC in_review; reject → discard)
 *
 * Does not require an attached project.
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type {
  MiningCandidateAction,
  MiningCandidateStatus,
  MiningCandidateType,
} from '../../client/mining-types.js';
import type { CliResult } from '../project-context.js';

const VALID_STATUSES: MiningCandidateStatus[] = ['candidate', 'approved', 'rejected'];
const VALID_ACTIONS: MiningCandidateAction[] = ['approve', 'reject'];
const KNOWN_TYPES: MiningCandidateType[] = [
  'semantic_conflict',
  'procedure',
  'promotion',
  'entity_fact',
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

export async function runCandidatesListCommand(
  client: LoxtepClient,
  options?: {
    candidate_type?: string;
    status?: string;
    mining_run_id?: string;
    organization_id?: string;
  }
): Promise<CliResult> {
  if (options?.status && !VALID_STATUSES.includes(options.status as MiningCandidateStatus)) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Invalid status filter: '${options.status}'. Must be one of: ${VALID_STATUSES.join(', ')}.`,
      ],
    };
  }
  if (
    options?.candidate_type &&
    !KNOWN_TYPES.includes(options.candidate_type as MiningCandidateType)
  ) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Invalid --type: '${options.candidate_type}'. Known types: ${KNOWN_TYPES.join(', ')}.`,
      ],
    };
  }

  const org = await resolveOrganizationId(client, options?.organization_id);
  if (!org.ok) {
    return { exitCode: 1, stdout: [], stderr: [org.error] };
  }

  try {
    const result = await client.review.mining.list_candidates({
      organization_id: org.organization_id,
      ...(options?.candidate_type
        ? { candidate_type: options.candidate_type as MiningCandidateType }
        : {}),
      ...(options?.status ? { status: options.status as MiningCandidateStatus } : {}),
      ...(options?.mining_run_id ? { mining_run_id: options.mining_run_id } : {}),
    });
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to list candidates: ${message}`] };
  }
}

export async function runCandidatesActCommand(
  client: LoxtepClient,
  candidate_id: string,
  options: {
    action?: string;
    organization_id?: string;
    rationale?: string;
    actor?: string;
  }
): Promise<CliResult> {
  if (!candidate_id) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: ['candidate_id is required.'],
    };
  }
  if (!options.action) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `--action is required. Must be one of: ${VALID_ACTIONS.join(', ')}. ` +
          'approve routes the candidate into CDLC in_review; reject discards it.',
      ],
    };
  }
  if (!VALID_ACTIONS.includes(options.action as MiningCandidateAction)) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Invalid --action: '${options.action}'. Must be one of: ${VALID_ACTIONS.join(', ')}. ` +
          'approve routes the candidate into CDLC in_review; reject discards it.',
      ],
    };
  }

  const org = await resolveOrganizationId(client, options.organization_id);
  if (!org.ok) {
    return { exitCode: 1, stdout: [], stderr: [org.error] };
  }

  try {
    const result = await client.review.mining.act_on_candidate({
      candidate_id,
      action: options.action as MiningCandidateAction,
      organization_id: org.organization_id,
      ...(options.rationale != null ? { rationale: options.rationale } : {}),
      ...(options.actor != null ? { actor: options.actor } : {}),
    });
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
      stderr: [
        `Failed to act on candidate '${candidate_id}' (${options.action}): ${message}`,
      ],
    };
  }
}
