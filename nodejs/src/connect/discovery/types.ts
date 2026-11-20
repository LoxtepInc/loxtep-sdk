/**
 * Shared discovery pipeline types (loxtep#4801 / #4807).
 * One discover → propose → gate → apply grammar; adapters specialize payloads.
 * See plans/discovery-framework.md.
 */

export type DiscoverySourceKind =
  | 'mcp_local'
  | 'directory_connector'
  | 'directory_csv'
  | string;

export type DiscoveryAuthState = 'authed' | 'needs_auth' | 'unknown' | 'unreachable';

/** Shared candidate — fingerprint/origin never include secrets. */
export interface DiscoveryCandidate {
  fingerprint: string;
  origin: string;
  source_kind: DiscoverySourceKind;
  display_hint?: string;
  auth_state?: DiscoveryAuthState;
  /** Adapter-specific payload; still no secrets. */
  payload: Record<string, unknown>;
}

export interface DiscoveryProposal<D extends string = string> {
  candidate: DiscoveryCandidate;
  disposition: D;
  display_name: string;
  reason: string;
  annotations?: Record<string, unknown>;
}

/**
 * Gate policy. Directory invites always use `human_pick` with an explicit
 * selection set (default empty — never auto-invite all).
 */
export type DiscoveryGate =
  | { mode: 'none' }
  | { mode: 'auto'; when: string }
  | { mode: 'human_pick'; selected: string[] };

export interface DiscoveryApplyResult {
  applied: Array<{
    fingerprint: string;
    id?: string;
    issue_id?: string;
    reused?: boolean;
  }>;
  skipped: DiscoveryProposal[];
  proposals: DiscoveryProposal[];
}

/** Common connector metadata.discovery stamp (adapters may add extras). */
export interface DiscoveryMetadataStamp {
  source: string;
  fingerprint: string;
  source_kind: DiscoverySourceKind;
  proposed_at: string;
  [key: string]: unknown;
}
