/**
 * CLI: loxtep approvals list|approve|reject
 *
 * Mirrors MCP `loxtep_review.list_pending` / `resolve` plus REST body fields
 * (`response`, `form_response`) for criteria_schema gates.
 *
 *   loxtep approvals list [--status pending|approved|rejected|expired] [--page N] [--page-size N] [--organization-id <id>]
 *   loxtep approvals approve <id> [--response <val>] [--form-response <json>] [--organization-id <id>]
 *   loxtep approvals reject <id> [--response <val>] [--form-response <json>] [--organization-id <id>]
 *
 * `list` defaults to `pending` (MCP list_pending parity). Auth required; no project attach.
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type {
  ApprovalStatus,
  ApprovalsListFilters,
  ApprovalsResolveOptions,
} from '../../client/approvals-types.js';
import type { CliResult } from '../project-context.js';

const VALID_STATUSES: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'expired'];

export interface ApprovalsListOptions {
  status?: string;
  page?: number;
  page_size?: number;
  organization_id?: string;
}

export interface ApprovalsDecideOptions {
  response?: string;
  form_response_json?: string;
  organization_id?: string;
}

function parsePositiveInt(raw: string | undefined, flag: string): { ok: true; value?: number } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: undefined };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: `Invalid ${flag}: '${raw}'. Must be a positive integer.` };
  }
  return { ok: true, value: n };
}

function parseDecideOptions(options?: ApprovalsDecideOptions):
  | { ok: true; body: ApprovalsResolveOptions }
  | { ok: false; error: string } {
  const body: ApprovalsResolveOptions = {};
  if (options?.organization_id !== undefined) body.organization_id = options.organization_id;
  if (options?.response !== undefined) body.response = options.response;
  if (options?.form_response_json !== undefined) {
    try {
      const parsed: unknown = JSON.parse(options.form_response_json);
      if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
        return {
          ok: false,
          error: 'Invalid --form-response: must be a JSON object (or null).',
        };
      }
      body.form_response = parsed as Record<string, unknown> | null;
    } catch {
      return { ok: false, error: 'Invalid --form-response: must be valid JSON.' };
    }
  }
  return { ok: true, body };
}

/**
 * Execute `loxtep approvals list`.
 * Defaults status to pending when --status is omitted (MCP list_pending parity).
 */
export async function runApprovalsListCommand(
  client: LoxtepClient,
  options?: ApprovalsListOptions
): Promise<CliResult> {
  try {
    const filters: ApprovalsListFilters = {};

    const status = options?.status ?? 'pending';
    if (!VALID_STATUSES.includes(status as ApprovalStatus)) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          `Invalid status filter: '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}.`,
        ],
      };
    }
    filters.status = status as ApprovalStatus;
    if (options?.organization_id) {
      filters.organization_id = options.organization_id;
    }

    if (options?.page != null) {
      if (!Number.isInteger(options.page) || options.page < 1) {
        return {
          exitCode: 1,
          stdout: [],
          stderr: [`Invalid --page: '${options.page}'. Must be a positive integer.`],
        };
      }
      filters.page = options.page;
    }
    if (options?.page_size != null) {
      if (!Number.isInteger(options.page_size) || options.page_size < 1) {
        return {
          exitCode: 1,
          stdout: [],
          stderr: [`Invalid --page-size: '${options.page_size}'. Must be a positive integer.`],
        };
      }
      filters.page_size = options.page_size;
    }

    const result = await client.review.approvals.list(filters);
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

/**
 * Execute `loxtep approvals approve <id>`.
 */
export async function runApprovalsApproveCommand(
  client: LoxtepClient,
  id: string,
  options?: ApprovalsDecideOptions
): Promise<CliResult> {
  const parsed = parseDecideOptions(options);
  if (!parsed.ok) {
    return { exitCode: 1, stdout: [], stderr: [parsed.error] };
  }
  try {
    const result = await client.review.approvals.approve(id, parsed.body);
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
      stderr: [`Error: Failed to approve approval '${id}': ${message}`],
    };
  }
}

/**
 * Execute `loxtep approvals reject <id>`.
 */
export async function runApprovalsRejectCommand(
  client: LoxtepClient,
  id: string,
  options?: ApprovalsDecideOptions
): Promise<CliResult> {
  const parsed = parseDecideOptions(options);
  if (!parsed.ok) {
    return { exitCode: 1, stdout: [], stderr: [parsed.error] };
  }
  try {
    const result = await client.review.approvals.reject(id, parsed.body);
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
      stderr: [`Error: Failed to reject approval '${id}': ${message}`],
    };
  }
}

/** Parse CLI flag strings into list numeric options (used by index.ts). */
export function parseApprovalsListNumericFlags(flags: {
  page?: string;
  page_size?: string;
}): { ok: true; page?: number; page_size?: number } | { ok: false; error: string } {
  const page = parsePositiveInt(flags.page, '--page');
  if (!page.ok) return page;
  const pageSize = parsePositiveInt(flags.page_size, '--page-size');
  if (!pageSize.ok) return pageSize;
  return { ok: true, page: page.value, page_size: pageSize.value };
}
