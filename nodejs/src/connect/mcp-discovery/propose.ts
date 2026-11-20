/**
 * Classify discovered MCP servers into connector proposals.
 */

import {
  GENERIC_HTTP_CONNECTOR_TYPE,
  matchKnownConnector,
  scoreIngestFit,
} from './known-connector-map.js';
import type {
  ConnectorProposal,
  DiscoveredMcpServer,
  ProposeConnectorsOptions,
} from './types.js';

function displayName(server: DiscoveredMcpServer): string {
  return server.name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function findExisting(
  server: DiscoveredMcpServer,
  connectorType: string,
  existing: ProposeConnectorsOptions['existing_connectors']
): string | undefined {
  if (!existing?.length) return undefined;
  for (const c of existing) {
    const meta = c.metadata ?? {};
    const discovery = (meta.discovery ?? {}) as Record<string, unknown>;
    if (
      typeof discovery.fingerprint === 'string' &&
      discovery.fingerprint === server.fingerprint
    ) {
      return c.connector_id;
    }
    const name = typeof meta.name === 'string' ? meta.name : undefined;
    if (
      c.connector_type === connectorType &&
      name &&
      name.toLowerCase() === displayName(server).toLowerCase()
    ) {
      return c.connector_id;
    }
    if (
      c.connector_type === connectorType &&
      typeof discovery.mcp_name === 'string' &&
      discovery.mcp_name === server.name
    ) {
      return c.connector_id;
    }
  }
  return undefined;
}

/**
 * Map one discovered server to a proposal (no writes).
 */
export function classifyDiscoveredServer(
  server: DiscoveredMcpServer,
  opts: ProposeConnectorsOptions = {}
): ConnectorProposal {
  const includeStdio = opts.include_stdio === true;
  const name = displayName(server);

  if (server.transport === 'stdio' && !includeStdio) {
    return {
      discovered: server,
      disposition: 'skip',
      connector_type: 'local-stdio',
      display_name: name,
      reason: 'Stdio MCP is local-only; pass include_stdio to suggest a local bridge (never cloud ingest)',
      ingest_fit: 'none',
    };
  }

  if (server.transport === 'stdio' && includeStdio) {
    return {
      discovered: server,
      disposition: 'skip',
      connector_type: 'local-stdio',
      display_name: name,
      reason:
        'Stdio MCP marked for local agent runtime only; no org cloud connector created',
      ingest_fit: 'none',
    };
  }

  const known = matchKnownConnector({ name: server.name, url: server.url });
  const toolFit = scoreIngestFit(server.tool_names);
  const ingest_fit = known?.ingest_fit ?? toolFit;

  if (!known && toolFit === 'none') {
    return {
      discovered: server,
      disposition: 'action_only',
      connector_type: 'action',
      display_name: name,
      reason: 'Toolset looks write/action-only; not creating a Connect ingest connector',
      ingest_fit: 'none',
    };
  }

  const connector_type = known?.connector_type ?? GENERIC_HTTP_CONNECTOR_TYPE;
  const existing_connector_id = findExisting(server, connector_type, opts.existing_connectors);
  if (existing_connector_id) {
    return {
      discovered: server,
      disposition: 'map_existing',
      connector_type,
      display_name: name,
      reason: `Org already has connector ${existing_connector_id} for this fingerprint/type+name`,
      existing_connector_id,
      ingest_fit,
    };
  }

  const reason = known
    ? known.reason
    : `HTTP/SSE MCP → ${GENERIC_HTTP_CONNECTOR_TYPE} (pending_auth; mcp-http type is P2)`;

  return {
    discovered: server,
    disposition: 'create_connector',
    connector_type,
    display_name: name,
    reason,
    ingest_fit,
  };
}

/**
 * Suggest connector mappings (no writes).
 */
export function proposeConnectors(
  discovered: DiscoveredMcpServer[],
  opts: ProposeConnectorsOptions = {}
): ConnectorProposal[] {
  return discovered.map((s) => classifyDiscoveredServer(s, opts));
}

/**
 * Whether apply should create a connector for this proposal.
 */
export function shouldAutoCreate(
  proposal: ConnectorProposal,
  auto_create_when: 'high_confidence' | 'all_ingest' | 'never' = 'high_confidence'
): boolean {
  if (auto_create_when === 'never') return false;
  if (proposal.disposition !== 'create_connector') return false;
  if (proposal.discovered.transport === 'stdio') return false;
  if (auto_create_when === 'all_ingest') {
    return proposal.ingest_fit !== 'none';
  }
  // high_confidence
  return (
    proposal.ingest_fit === 'high' ||
    proposal.ingest_fit === 'medium' ||
    matchKnownConnector({
      name: proposal.discovered.name,
      url: proposal.discovered.url,
    }) != null
  );
}
