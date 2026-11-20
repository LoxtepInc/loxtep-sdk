/**
 * Directory invite adapter types (loxtep#4807).
 * Specializes shared DiscoveryCandidate / DiscoveryProposal — not a parallel stack.
 */

import type {
  DiscoveryCandidate,
  DiscoveryGate,
  DiscoveryProposal,
  DiscoverySourceKind,
} from '../../connect/discovery/types.js';

export type {
  DiscoveryCandidate,
  DiscoveryGate,
  DiscoveryProposal,
  DiscoverySourceKind,
};

export type InviteDisposition =
  | 'invite_new'
  | 'invite_membership'
  | 'skip_member'
  | 'skip_pending'
  | 'skip_no_email';

export type DirectoryPersonStatus = 'active' | 'inactive' | 'unknown';

export type DirectorySourceType =
  | 'google-workspace'
  | 'microsoft-365'
  | 'bamboohr'
  | 'workday'
  | 'csv';

export interface DirectoryPerson {
  email: string;
  display_name?: string;
  external_id?: string;
  department?: string;
  status: DirectoryPersonStatus;
  /** connector_id or 'csv' */
  source: string;
  fingerprint: string;
}

export type InviteProposal = DiscoveryProposal<InviteDisposition>;

export interface DirectoryOrgContext {
  member_emails: Set<string> | string[];
  pending_invite_emails: Set<string> | string[];
  /** Optional org email domain for suggested (unchecked) hints */
  org_email_domain?: string | null;
}

export interface DirectoryDiscoverResult {
  source_connector_id?: string;
  source_kind: DiscoverySourceKind;
  proposals: InviteProposal[];
  /** Always human_pick; default selection empty. */
  gate: DiscoveryGate;
  /** Explicit: roster/CSV discover never starts Products ingest. */
  ingest_started: false;
  auth_state?: 'authed' | 'needs_auth' | 'unknown';
  metadata?: {
    proposal_count: number;
    invite_new_count: number;
    skip_member_count: number;
    skip_pending_count: number;
  };
}

export interface DiscoverDirectoryPeopleOptions {
  connector_id?: string;
  source_type?: DirectorySourceType;
  /** Raw CSV text (plain). */
  csv_data?: string;
  csv_encoding?: 'base64' | 'plain';
  delimiter?: ',' | ';' | '\t';
  /** Pre-normalized people (tests / roster already fetched). */
  people?: Array<{
    email: string;
    display_name?: string;
    external_id?: string;
    department?: string;
    status?: DirectoryPersonStatus;
  }>;
  org_email_domain?: string | null;
  /** When true, call platform directory-discover (default true when org_id known). */
  use_platform?: boolean;
  max_results?: number;
  organization_id?: string;
}

export interface ProposeInviteesOptions {
  org?: DirectoryOrgContext;
  source_kind?: DiscoverySourceKind;
}

export interface InviteFromDirectoryOptions {
  /**
   * Explicit selection: emails and/or fingerprints.
   * Required and must be non-empty — never auto-invite all proposals.
   */
  emails?: string[];
  fingerprints?: string[];
  selected?: string[];
  role?: string;
  connector_id?: string;
  organization_id?: string;
  /** Optional proposals to gate against; if omitted, invites selected emails directly. */
  proposals?: InviteProposal[];
  message?: string;
}

export interface BulkInviteSuccess {
  email: string;
  invitation_id: string | null;
  role: string | null;
}

export interface BulkInviteFailure {
  email: string;
  error: string;
}

export interface BulkInviteResponse {
  invited: BulkInviteSuccess[];
  failures: BulkInviteFailure[];
  metadata: {
    total_requested: number;
    invited_count: number;
    failure_count: number;
  };
  /** Fingerprints / emails that were not in the selection set (never invited). */
  skipped_unselected?: InviteProposal[];
}

export const DIRECTORY_CONNECTOR_TYPE_GOOGLE_WORKSPACE = 'google-workspace';
