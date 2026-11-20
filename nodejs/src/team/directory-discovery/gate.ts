/**
 * Directory gate is always human_pick. Default selection is empty —
 * never auto-select all / never invite unselected rows.
 */

import type { DiscoveryGate, InviteProposal } from './types.js';

export function emptyHumanPickGate(): DiscoveryGate {
  return { mode: 'human_pick', selected: [] };
}

/**
 * Filter proposals to those whose fingerprint (or email) is in the selection set.
 * Unselected rows are never returned for apply.
 */
export function selectProposalsForInvite(
  proposals: InviteProposal[],
  selected: string[]
): InviteProposal[] {
  const selectedSet = new Set(
    selected.map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
  if (selectedSet.size === 0) {
    return [];
  }

  return proposals.filter((p) => {
    if (p.disposition !== 'invite_new' && p.disposition !== 'invite_membership') {
      return false;
    }
    const email = String(p.candidate.payload.email ?? '')
      .trim()
      .toLowerCase();
    return (
      selectedSet.has(p.candidate.fingerprint.toLowerCase()) ||
      (email.length > 0 && selectedSet.has(email))
    );
  });
}

/**
 * Build bulk-invite email list from gated proposals. Empty selection → empty list.
 */
export function emailsForSelectedInvites(
  proposals: InviteProposal[],
  selected: string[]
): string[] {
  return selectProposalsForInvite(proposals, selected)
    .map((p) =>
      String(p.candidate.payload.email ?? '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
}

/**
 * Resolve the explicit selection set from invite options.
 * Empty / missing → refuse apply (caller must pass selection).
 */
export function resolveSelection(opts: {
  emails?: string[];
  fingerprints?: string[];
  selected?: string[];
}): string[] {
  const merged = [
    ...(opts.selected ?? []),
    ...(opts.emails ?? []),
    ...(opts.fingerprints ?? []),
  ];
  return [...new Set(merged.map((s) => s.trim().toLowerCase()).filter(Boolean))];
}
