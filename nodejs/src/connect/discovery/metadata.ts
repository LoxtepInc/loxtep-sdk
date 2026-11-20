/**
 * Shared discovery metadata stamp for connectors created/reused by apply.
 */

import type { DiscoveryMetadataStamp, DiscoverySourceKind } from './types.js';

export interface BuildDiscoveryMetadataInput {
  source: string;
  fingerprint: string;
  source_kind: DiscoverySourceKind;
  /** ISO timestamp; defaults to now. */
  proposed_at?: string;
  /** Adapter extras (mcp_name, transport, …) — keep secrets out. */
  extras?: Record<string, unknown>;
}

/**
 * Build `metadata.discovery` stamp. Never include secrets.
 */
export function buildDiscoveryMetadataStamp(
  input: BuildDiscoveryMetadataInput
): DiscoveryMetadataStamp {
  return {
    source: input.source,
    fingerprint: input.fingerprint,
    source_kind: input.source_kind,
    proposed_at: input.proposed_at ?? new Date().toISOString(),
    ...(input.extras ?? {}),
  };
}
