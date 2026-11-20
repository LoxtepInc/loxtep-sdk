/**
 * Local MCP discovery types (loxtep#4801).
 * Discover IDE MCP configs → propose Loxtep connectors → optional apply.
 */

export type McpAuthState = 'authed' | 'needs_auth' | 'unknown' | 'unreachable';
export type McpTransport = 'http' | 'sse' | 'stdio';
export type ProposeDisposition =
  | 'create_connector'
  | 'map_existing'
  | 'action_only'
  | 'skip';

export type McpDiscoverySource =
  | 'cursor'
  | 'claude-code'
  | 'claude-desktop'
  | 'codex'
  | 'vscode'
  | 'mcporter';

export type IngestFit = 'high' | 'medium' | 'low' | 'none';

export type AutoCreateWhen = 'high_confidence' | 'all_ingest' | 'never';

export interface DiscoveredMcpServer {
  name: string;
  transport: McpTransport;
  /** http/sse endpoint (no secrets). */
  url?: string;
  /** stdio command (no env secrets). */
  command?: string;
  args?: string[];
  /** e.g. cursor:/home/user/.cursor/mcp.json */
  origin: string;
  auth_state: McpAuthState;
  tool_names?: string[];
  resource_uris?: string[];
  /** Stable hash of transport + endpoint (no secrets). */
  fingerprint: string;
}

export interface ConnectorProposal {
  discovered: DiscoveredMcpServer;
  disposition: ProposeDisposition;
  connector_type: string;
  display_name: string;
  reason: string;
  existing_connector_id?: string;
  ingest_fit: IngestFit;
}

export interface DiscoverResultCreated {
  connector_id: string;
  issue_id?: string;
  proposal: ConnectorProposal;
  /** True when an existing org connector was reused (dedupe). */
  reused?: boolean;
}

export interface DiscoverResult {
  proposals: ConnectorProposal[];
  created: DiscoverResultCreated[];
  skipped: ConnectorProposal[];
}

export interface DiscoverLocalMcpsOptions {
  sources?: McpDiscoverySource[];
  /** Include stdio servers (default false — cloud ingest path skips them). */
  include_stdio?: boolean;
  /** Working directory for project-scoped configs. Defaults to process.cwd(). */
  cwd?: string;
  /** Override home directory (tests). Defaults to os.homedir(). */
  home_dir?: string;
}

export interface ProposeConnectorsOptions {
  /** Existing org connectors for map_existing / dedupe hints. */
  existing_connectors?: Array<{
    connector_id: string;
    connector_type: string;
    metadata?: Record<string, unknown>;
  }>;
  include_stdio?: boolean;
}

export interface DiscoverAndProposeOptions {
  /** Library default false; CLI --apply sets true. */
  apply?: boolean;
  include_stdio?: boolean;
  sources?: McpDiscoverySource[];
  auto_create_when?: AutoCreateWhen;
  /** Default true when apply. */
  open_auth_issues?: boolean;
  assignee?: 'human' | { user_id: string };
  cwd?: string;
  home_dir?: string;
}

/** Metadata written on pending_auth connectors created by discovery apply. */
export interface DiscoveryConnectorMetadata {
  name: string;
  status: 'pending_auth';
  discovery: {
    source: string;
    fingerprint: string;
    source_kind: 'mcp_local';
    mcp_name: string;
    transport: McpTransport;
    url?: string;
    tool_sample?: string[];
    proposed_at: string;
  };
}
