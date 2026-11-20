/**
 * Shared Connection Expert auth-issue helpers for discovery apply.
 * Used by MCP connector create and directory source connector auth.
 */

import type { DiscoverySourceKind } from './types.js';

/** Dedupe key for connector auth issues (one shape for all Connect credential gaps). */
export function authDedupeKey(organizationId: string, connectorId: string): string {
  return `connector-auth:${organizationId}:${connectorId}`;
}

export function buildAuthIssueTitle(displayName: string): string {
  return `Authenticate ${displayName}`;
}

export interface BuildAuthIssueDescriptionInput {
  display_name: string;
  connector_id: string;
  connector_type: string;
  oauth_url?: string;
  fingerprint: string;
  dedupe_key: string;
  source_kind?: DiscoverySourceKind;
  /** Extra context fields (e.g. ingest_fit for MCP). */
  extra_context?: Record<string, unknown>;
}

/**
 * Human-readable auth issue body + JSON context.
 * Never instructs copying IDE/vault tokens automatically.
 */
export function buildAuthIssueDescription(input: BuildAuthIssueDescriptionInput): string {
  const steps = [
    `Authenticate the Loxtep connector "${input.display_name}".`,
    '',
    'Steps:',
    '1. Open Connect in Loxtep and select this connector.',
    '2. Complete OAuth or paste the required API key into Loxtep secrets.',
    '3. Run a connector test; do not start ingest until verified.',
    '',
    'Local IDE/MCP vault tokens are never copied automatically.',
  ];
  const context: Record<string, unknown> = {
    connector_id: input.connector_id,
    connector_type: input.connector_type,
    discovery_fingerprint: input.fingerprint,
    dedupe_key: input.dedupe_key,
    ...(input.source_kind ? { source_kind: input.source_kind } : {}),
    ...(input.oauth_url ? { oauth_url: input.oauth_url } : {}),
    ...(input.extra_context ?? {}),
  };
  return `${steps.join('\n')}\n\n---\nContext (JSON): ${JSON.stringify(context, null, 2)}`;
}

export interface AuthIssueCreatePayload {
  title: string;
  description: string;
  status: 'open';
  dedupe_key: string;
  context: Record<string, unknown>;
  assignee_user_id?: string | null;
  organization_id?: string;
}

/**
 * Build the create payload for a Connection Expert auth issue.
 */
export function buildAuthIssueCreatePayload(input: {
  display_name: string;
  connector_id: string;
  connector_type: string;
  organization_id: string;
  fingerprint: string;
  oauth_url?: string;
  source_kind?: DiscoverySourceKind;
  assignee_user_id?: string | null;
  extra_context?: Record<string, unknown>;
}): AuthIssueCreatePayload {
  const dedupe_key = authDedupeKey(input.organization_id, input.connector_id);
  const context: Record<string, unknown> = {
    connector_id: input.connector_id,
    connector_type: input.connector_type,
    discovery_fingerprint: input.fingerprint,
    ...(input.source_kind ? { source_kind: input.source_kind } : {}),
    ...(input.oauth_url ? { oauth_url: input.oauth_url } : {}),
    ...(input.extra_context ?? {}),
  };
  return {
    title: buildAuthIssueTitle(input.display_name),
    description: buildAuthIssueDescription({
      display_name: input.display_name,
      connector_id: input.connector_id,
      connector_type: input.connector_type,
      oauth_url: input.oauth_url,
      fingerprint: input.fingerprint,
      dedupe_key,
      source_kind: input.source_kind,
      extra_context: input.extra_context,
    }),
    status: 'open',
    dedupe_key,
    context,
    assignee_user_id: input.assignee_user_id ?? null,
    organization_id: input.organization_id,
  };
}
