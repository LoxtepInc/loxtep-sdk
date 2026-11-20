/**
 * inviteFromDirectory — apply invites ONLY for an explicit human_pick selection.
 * Never auto-invite all proposals. Never starts Products ingest.
 */

import type { LoxtepHttpClient } from '../../http/client.js';
import {
  emailsForSelectedInvites,
  resolveSelection,
  selectProposalsForInvite,
} from './gate.js';
import type {
  BulkInviteFailure,
  BulkInviteResponse,
  BulkInviteSuccess,
  InviteFromDirectoryOptions,
  InviteProposal,
} from './types.js';

export interface InviteFromDirectoryDeps {
  http: LoxtepHttpClient;
  organization_id?: string;
}

/**
 * Apply directory invites for an explicit selection set only.
 * Throws if selection is empty — never invites "all proposals".
 */
export async function inviteFromDirectory(
  deps: InviteFromDirectoryDeps,
  opts: InviteFromDirectoryOptions
): Promise<BulkInviteResponse> {
  const organizationId = opts.organization_id ?? deps.organization_id;
  if (!organizationId) {
    throw new Error(
      'organization_id is required for inviteFromDirectory (set it on the client or pass it explicitly)'
    );
  }

  const selected = resolveSelection(opts);
  if (selected.length === 0) {
    throw new Error(
      'inviteFromDirectory requires an explicit selection (emails, fingerprints, or selected). Never auto-invites all directory proposals.'
    );
  }

  let emails: string[];
  let skippedUnselected: InviteProposal[] | undefined;

  if (opts.proposals?.length) {
    const gated = selectProposalsForInvite(opts.proposals, selected);
    emails = emailsForSelectedInvites(opts.proposals, selected);
    skippedUnselected = opts.proposals.filter((p) => !gated.includes(p));
    if (emails.length === 0) {
      throw new Error(
        'inviteFromDirectory selection matched no inviteable proposals (invite_new / invite_membership). Unselected and skip_* rows are never invited.'
      );
    }
  } else {
    // Direct email selection without prior proposals — still requires explicit list.
    emails = [
      ...new Set(
        (opts.emails ?? selected)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes('@'))
      ),
    ];
    if (emails.length === 0) {
      throw new Error(
        'inviteFromDirectory requires email addresses in the selection set when proposals are omitted'
      );
    }
  }

  const invitations = emails.map((email) => ({
    email,
    ...(opts.role ? { role: opts.role } : {}),
  }));

  const res = await deps.http.post<{
    success?: boolean;
    data?: {
      invited?: BulkInviteSuccess[];
      failures?: BulkInviteFailure[];
      metadata?: {
        total_requested?: number;
        invited_count?: number;
        failure_count?: number;
      };
    };
    invited?: BulkInviteSuccess[];
    failures?: BulkInviteFailure[];
  }>(
    `/organizations/organizations/${encodeURIComponent(organizationId)}/members/bulk-invite`,
    {
      organization_id: organizationId,
      invitations,
      ...(opts.role ? { default_role: opts.role } : {}),
      ...(opts.message ? { message: opts.message } : {}),
    }
  );

  const data =
    (res as { data?: Record<string, unknown> }).data ?? (res as Record<string, unknown>);
  const invited = (Array.isArray(data.invited) ? data.invited : []) as BulkInviteSuccess[];
  const failures = (Array.isArray(data.failures) ? data.failures : []) as BulkInviteFailure[];
  const metadataRaw = (data.metadata ?? {}) as Record<string, unknown>;

  return {
    invited,
    failures,
    metadata: {
      total_requested: Number(metadataRaw.total_requested ?? invitations.length),
      invited_count: Number(metadataRaw.invited_count ?? invited.length),
      failure_count: Number(metadataRaw.failure_count ?? failures.length),
    },
    ...(skippedUnselected ? { skipped_unselected: skippedUnselected } : {}),
  };
}
