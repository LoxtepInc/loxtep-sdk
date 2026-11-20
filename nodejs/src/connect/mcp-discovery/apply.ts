/**
 * discoverAndPropose — suggest + optionally create pending_auth connectors + auth issues.
 * Never copies IDE/vault tokens into create payloads.
 */

import { discoverLocalMcps } from './discover.js';
import { proposeConnectors, shouldAutoCreate } from './propose.js';
import type {
  ConnectorProposal,
  DiscoverAndProposeOptions,
  DiscoverResult,
  DiscoverResultCreated,
  DiscoveryConnectorMetadata,
} from './types.js';

export interface ConnectorCreateClient {
  list: (filters?: {
    page?: number;
    page_size?: number;
  }) => Promise<{ items: Array<{
    connector_id: string;
    connector_type: string;
    organization_id?: string;
    metadata?: Record<string, unknown>;
  }> }>;
  create: (input: {
    connector_type: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ connector_id: string; metadata?: Record<string, unknown> }>;
  get_oauth_url?: (
    connector_id: string
  ) => Promise<{ oauth_url: string }>;
}

export interface IssuesCreateClient {
  create: (input: {
    title: string;
    description?: string | null;
    status?: string;
    assignee_user_id?: string | null;
    organization_id?: string;
    dedupe_key?: string;
    context?: Record<string, unknown>;
  }) => Promise<{ issue_id?: string; id?: string; [key: string]: unknown }>;
}

export interface DiscoverAndProposeDeps {
  connectors: ConnectorCreateClient;
  issues?: IssuesCreateClient;
  organization_id?: string;
  /** Resolve current user id when assignee is 'human'. */
  resolve_human_user_id?: () => Promise<string | undefined>;
}

function buildDiscoveryMetadata(
  proposal: ConnectorProposal
): DiscoveryConnectorMetadata {
  return {
    name: proposal.display_name,
    status: 'pending_auth',
    discovery: {
      source: proposal.discovered.origin,
      fingerprint: proposal.discovered.fingerprint,
      mcp_name: proposal.discovered.name,
      transport: proposal.discovered.transport,
      ...(proposal.discovered.url ? { url: proposal.discovered.url } : {}),
      ...(proposal.discovered.tool_names?.length
        ? { tool_sample: proposal.discovered.tool_names.slice(0, 10) }
        : {}),
      proposed_at: new Date().toISOString(),
    },
  };
}

function authDedupeKey(organizationId: string, connectorId: string): string {
  return `connector-auth:${organizationId}:${connectorId}`;
}

function buildAuthIssueDescription(input: {
  display_name: string;
  connector_id: string;
  connector_type: string;
  oauth_url?: string;
  fingerprint: string;
  ingest_fit: string;
  dedupe_key: string;
}): string {
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
  const context = {
    connector_id: input.connector_id,
    connector_type: input.connector_type,
    discovery_fingerprint: input.fingerprint,
    ingest_fit: input.ingest_fit,
    dedupe_key: input.dedupe_key,
    ...(input.oauth_url ? { oauth_url: input.oauth_url } : {}),
  };
  return `${steps.join('\n')}\n\n---\nContext (JSON): ${JSON.stringify(context, null, 2)}`;
}

async function listAllConnectors(
  connectors: ConnectorCreateClient
): Promise<
  Array<{
    connector_id: string;
    connector_type: string;
    organization_id?: string;
    metadata?: Record<string, unknown>;
  }>
> {
  const items: Array<{
    connector_id: string;
    connector_type: string;
    organization_id?: string;
    metadata?: Record<string, unknown>;
  }> = [];
  let page = 1;
  for (;;) {
    const res = await connectors.list({ page, page_size: 100 });
    items.push(...(res.items ?? []));
    if (!res.items?.length || res.items.length < 100) break;
    page += 1;
    if (page > 50) break;
  }
  return items;
}

/**
 * Discover local MCPs, propose connectors, optionally create pending_auth + auth issues.
 */
export async function discoverAndPropose(
  deps: DiscoverAndProposeDeps,
  opts: DiscoverAndProposeOptions = {}
): Promise<DiscoverResult> {
  const apply = opts.apply === true;
  const openAuthIssues =
    opts.open_auth_issues !== undefined ? opts.open_auth_issues : apply;
  const autoCreateWhen = opts.auto_create_when ?? 'high_confidence';

  let existing: Awaited<ReturnType<typeof listAllConnectors>> = [];
  try {
    existing = await listAllConnectors(deps.connectors);
  } catch (err) {
    if (apply) throw err;
    // Dry-run can proceed without org connector list (offline / unauthenticated).
  }
  const discovered = await discoverLocalMcps({
    sources: opts.sources,
    include_stdio: opts.include_stdio,
    cwd: opts.cwd,
    home_dir: opts.home_dir,
  });
  const proposals = proposeConnectors(discovered, {
    existing_connectors: existing,
    include_stdio: opts.include_stdio,
  });

  const created: DiscoverResultCreated[] = [];
  const skipped: ConnectorProposal[] = [];

  if (!apply) {
    for (const p of proposals) {
      if (!(p.disposition === 'create_connector' && shouldAutoCreate(p, autoCreateWhen))) {
        skipped.push(p);
      }
    }
    return { proposals, created, skipped };
  }

  let humanUserId: string | undefined;
  if (openAuthIssues && opts.assignee === 'human' && deps.resolve_human_user_id) {
    humanUserId = await deps.resolve_human_user_id();
  } else if (
    openAuthIssues &&
    opts.assignee &&
    typeof opts.assignee === 'object' &&
    'user_id' in opts.assignee
  ) {
    humanUserId = opts.assignee.user_id;
  }

  for (const proposal of proposals) {
    if (proposal.disposition === 'map_existing' && proposal.existing_connector_id) {
      created.push({
        connector_id: proposal.existing_connector_id,
        proposal,
        reused: true,
      });
      continue;
    }

    if (!shouldAutoCreate(proposal, autoCreateWhen)) {
      skipped.push(proposal);
      continue;
    }

    // Dedupe again against live list (fingerprint)
    const match = existing.find((c) => {
      const discovery = (c.metadata?.discovery ?? {}) as Record<string, unknown>;
      return discovery.fingerprint === proposal.discovered.fingerprint;
    });
    if (match) {
      created.push({
        connector_id: match.connector_id,
        proposal: {
          ...proposal,
          disposition: 'map_existing',
          existing_connector_id: match.connector_id,
        },
        reused: true,
      });
      continue;
    }

    const metadata = buildDiscoveryMetadata(proposal);
    // Never include secrets / headers / env from local vault
    const connector = await deps.connectors.create({
      connector_type: proposal.connector_type,
      metadata: metadata as unknown as Record<string, unknown>,
    });
    existing.push({
      connector_id: connector.connector_id,
      connector_type: proposal.connector_type,
      metadata: metadata as unknown as Record<string, unknown>,
    });

    let issue_id: string | undefined;
    if (openAuthIssues && deps.issues) {
      const orgId =
        deps.organization_id ??
        existing.find((c) => c.connector_id === connector.connector_id)
          ?.organization_id ??
        'unknown';
      const dedupe_key = authDedupeKey(orgId, connector.connector_id);

      let oauth_url: string | undefined;
      if (deps.connectors.get_oauth_url) {
        try {
          const oauth = await deps.connectors.get_oauth_url(connector.connector_id);
          oauth_url = oauth.oauth_url;
        } catch {
          // Type may not support OAuth — omit url
        }
      }

      const issue = await deps.issues.create({
        title: `Authenticate ${proposal.display_name}`,
        description: buildAuthIssueDescription({
          display_name: proposal.display_name,
          connector_id: connector.connector_id,
          connector_type: proposal.connector_type,
          oauth_url,
          fingerprint: proposal.discovered.fingerprint,
          ingest_fit: proposal.ingest_fit,
          dedupe_key,
        }),
        status: 'open',
        assignee_user_id: humanUserId ?? null,
        organization_id: deps.organization_id,
        dedupe_key,
        context: {
          connector_id: connector.connector_id,
          connector_type: proposal.connector_type,
          discovery_fingerprint: proposal.discovered.fingerprint,
          ingest_fit: proposal.ingest_fit,
          ...(oauth_url ? { oauth_url } : {}),
        },
      });
      issue_id = issue.issue_id ?? issue.id;
    }

    created.push({
      connector_id: connector.connector_id,
      issue_id,
      proposal,
    });
  }

  return { proposals, created, skipped };
}

export { buildDiscoveryMetadata, authDedupeKey, buildAuthIssueDescription };
