/**
 * Local MCP discovery → propose connectors → optional apply (loxtep#4801).
 * Imports shared `connect/discovery` core — do not fork fingerprint / auth-issue.
 */

export type {
  McpAuthState,
  McpTransport,
  ProposeDisposition,
  McpDiscoverySource,
  IngestFit,
  AutoCreateWhen,
  DiscoveredMcpServer,
  ConnectorProposal,
  DiscoverResultCreated,
  DiscoverResult,
  DiscoverLocalMcpsOptions,
  ProposeConnectorsOptions,
  DiscoverAndProposeOptions,
  DiscoveryConnectorMetadata,
} from './types.js';

export { fingerprintMcpServer } from './fingerprint.js';
export { discoverLocalMcps } from './discover.js';
export {
  proposeConnectors,
  classifyDiscoveredServer,
  shouldAutoCreate,
} from './propose.js';
export {
  discoverAndPropose,
  buildDiscoveryMetadata,
  authDedupeKey,
  buildAuthIssueDescription,
} from './apply.js';
export type {
  DiscoverAndProposeDeps,
  ConnectorCreateClient,
  IssuesCreateClient,
} from './apply.js';
export {
  DEFAULT_DISCOVERY_SOURCES,
  pathsForSource,
} from './paths.js';
export {
  parseConfigFile,
  extractServersFromJson,
  extractServersFromToml,
  normalizeMcpEntry,
} from './parse-config.js';
export {
  matchKnownConnector,
  scoreIngestFit,
  GENERIC_HTTP_CONNECTOR_TYPE,
  isMcpHttpApplyEnabled,
} from './known-connector-map.js';
