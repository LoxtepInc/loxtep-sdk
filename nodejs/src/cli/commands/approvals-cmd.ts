/**
 * CLI: loxtep approvals list|approve|reject
 *
 * SDK/MCP parity for HITL approval inbox (`client.review.approvals` /
 * `loxtep_review`). Does not require an attached project.
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { ApprovalStatus } from '../../client/approvals-types.js';
import type { CliResult } from '../project-context.js';

const VALID_STATUSES: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'expired'];

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

export async function runApprovalsListCommand(
  client: LoxtepClient,
  options?: { status?: string; organization_id?: string; page?: number; page_size?: number }
): Promise<CliResult> {
  if (options?.status && !VALID_STATUSES.includes(options.status as ApprovalStatus)) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Invalid status filter: '${options.status}'. Must be one of: ${VALID_STATUSES.join(', ')}.`,
      ],
    };
  }

  const org = await resolveOrganizationId(client, options?.organization_id);
  if (!org.ok) {
    return { exitCode: 1, stdout: [], stderr: [org.error] };
  }

  try {
    const result = await client.review.approvals.list({
      organization_id: org.organization_id,
      status: options?.status as ApprovalStatus | undefined,
      page: options?.page,
      page_size: options?.page_size,
    });
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to list approvals: ${message}`] };
  }
}

export async function runApprovalsApproveCommand(
  client: LoxtepClient,
  approval_request_id: string,
  options?: { organization_id?: string }
): Promise<CliResult> {
  const org = await resolveOrganizationId(client, options?.organization_id);
  if (!org.ok) {
    return { exitCode: 1, stdout: [], stderr: [org.error] };
  }

  try {
    const result = await client.review.approvals.approve(
      approval_request_id,
      org.organization_id
    );
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to approve request: ${message}`] };
  }
}

export async function runApprovalsRejectCommand(
  client: LoxtepClient,
  approval_request_id: string,
  options?: { organization_id?: string }
): Promise<CliResult> {
  const org = await resolveOrganizationId(client, options?.organization_id);
  if (!org.ok) {
    return { exitCode: 1, stdout: [], stderr: [org.error] };
  }

  try {
    const result = await client.review.approvals.reject(
      approval_request_id,
      org.organization_id
    );
    return {
      exitCode: 0,
      stdout: [JSON.stringify(result, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to reject request: ${message}`] };
  }
}
