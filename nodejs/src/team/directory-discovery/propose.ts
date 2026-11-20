/**
 * Propose invite dispositions for directory people.
 */

import type {
  DirectoryOrgContext,
  DirectoryPerson,
  DiscoveryCandidate,
  DiscoverySourceKind,
  InviteDisposition,
  InviteProposal,
} from './types.js';

function toEmailSet(value: Set<string> | string[] | undefined): Set<string> {
  if (!value) return new Set();
  if (value instanceof Set) {
    return new Set([...value].map((e) => e.trim().toLowerCase()).filter(Boolean));
  }
  return new Set(value.map((e) => e.trim().toLowerCase()).filter(Boolean));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase() || null;
}

export function personToCandidate(
  person: DirectoryPerson,
  sourceKind: DiscoverySourceKind
): DiscoveryCandidate {
  return {
    fingerprint: person.fingerprint,
    origin: person.source,
    source_kind: sourceKind,
    display_hint: person.display_name || person.email,
    payload: {
      email: person.email,
      display_name: person.display_name,
      external_id: person.external_id,
      department: person.department,
      person_status: person.status,
    },
  };
}

/**
 * Propose invite dispositions. Soft-dep #4759: existing users elsewhere →
 * invite_membership when annotated; without membership data, unknown non-members
 * are invite_new.
 */
export function proposeInvitees(
  people: DirectoryPerson[],
  org: DirectoryOrgContext = { member_emails: [], pending_invite_emails: [] },
  sourceKind: DiscoverySourceKind = 'directory_csv'
): InviteProposal[] {
  const members = toEmailSet(org.member_emails);
  const pending = toEmailSet(org.pending_invite_emails);
  const orgDomain = org.org_email_domain?.toLowerCase() ?? null;

  return people.map((person) => {
    const email = normalizeEmail(person.email || '');
    const candidate = personToCandidate(person, sourceKind);
    const displayName = person.display_name?.trim() || email || 'Unknown';

    if (!email) {
      return {
        candidate,
        disposition: 'skip_no_email' as InviteDisposition,
        display_name: displayName,
        reason: 'No email address on directory row',
        annotations: {},
      };
    }

    if (members.has(email)) {
      return {
        candidate,
        disposition: 'skip_member' as InviteDisposition,
        display_name: displayName,
        reason: 'Already a member of this organization',
        annotations: { already_member: true, suggested: false },
      };
    }

    if (pending.has(email)) {
      return {
        candidate,
        disposition: 'skip_pending' as InviteDisposition,
        display_name: displayName,
        reason: 'Invitation already pending',
        annotations: { pending_invite: true, suggested: false },
      };
    }

    const domain = emailDomain(email);
    const suggested = Boolean(orgDomain && domain && domain === orgDomain);

    return {
      candidate,
      disposition: 'invite_new' as InviteDisposition,
      display_name: displayName,
      reason: suggested
        ? 'New invitee; same email domain as organization (suggested, not selected)'
        : 'New invitee; not a member and no pending invite',
      annotations: {
        suggested,
        already_member: false,
        pending_invite: false,
      },
    };
  });
}

export function summarizeProposals(proposals: InviteProposal[]): {
  proposal_count: number;
  invite_new_count: number;
  skip_member_count: number;
  skip_pending_count: number;
} {
  return {
    proposal_count: proposals.length,
    invite_new_count: proposals.filter((p) => p.disposition === 'invite_new').length,
    skip_member_count: proposals.filter((p) => p.disposition === 'skip_member').length,
    skip_pending_count: proposals.filter((p) => p.disposition === 'skip_pending').length,
  };
}
