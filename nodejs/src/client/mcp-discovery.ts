/**
 * client.connect.discovery — local MCP discovery + propose + apply (loxtep#4801).
 */

import {
  discoverAndPropose as runDiscoverAndPropose,
  discoverLocalMcps as runDiscoverLocalMcps,
  proposeConnectors as runProposeConnectors,
  type ConnectorProposal,
  type DiscoverAndProposeOptions,
  type DiscoverLocalMcpsOptions,
  type DiscoverResult,
  type DiscoveredMcpServer,
  type ProposeConnectorsOptions,
} from '../connect/mcp-discovery/index.js';
import type { createConnectorsApi } from './connectors.js';
import type { IssuesApi } from './agent-workspace.js';

export interface McpDiscoveryApiDeps {
  connectors: ReturnType<typeof createConnectorsApi>;
  issues: IssuesApi;
  organization_id?: string;
  resolve_human_user_id?: () => Promise<string | undefined>;
}

export type McpDiscoveryApi = {
  discoverLocalMcps: (
    opts?: DiscoverLocalMcpsOptions
  ) => Promise<DiscoveredMcpServer[]>;
  proposeConnectors: (
    discovered?: DiscoveredMcpServer[],
    opts?: ProposeConnectorsOptions
  ) => Promise<ConnectorProposal[]>;
  discoverAndPropose: (
    opts?: DiscoverAndProposeOptions
  ) => Promise<DiscoverResult>;
};

/**
 * Wire local MCP discovery onto the Connect facade.
 */
export function createMcpDiscoveryApi(deps: McpDiscoveryApiDeps): McpDiscoveryApi {
  return {
    async discoverLocalMcps(opts: DiscoverLocalMcpsOptions = {}) {
      return runDiscoverLocalMcps(opts);
    },

    async proposeConnectors(
      discovered?: DiscoveredMcpServer[],
      opts: ProposeConnectorsOptions = {}
    ) {
      let servers = discovered;
      if (!servers) {
        servers = await runDiscoverLocalMcps({
          include_stdio: opts.include_stdio,
        });
      }
      let existing = opts.existing_connectors;
      if (!existing) {
        try {
          const listed = await deps.connectors.list({ page_size: 100 });
          existing = listed.items.map((c) => ({
            connector_id: c.connector_id,
            connector_type: c.connector_type,
            metadata: c.metadata,
          }));
        } catch {
          existing = [];
        }
      }
      return runProposeConnectors(servers, {
        ...opts,
        existing_connectors: existing,
      });
    },

    async discoverAndPropose(opts: DiscoverAndProposeOptions = {}) {
      return runDiscoverAndPropose(
        {
          connectors: {
            list: (filters) => deps.connectors.list(filters),
            create: (input) => deps.connectors.create(input),
            get_oauth_url: (id) => deps.connectors.get_oauth_url(id),
          },
          issues: deps.issues,
          organization_id: deps.organization_id,
          resolve_human_user_id: deps.resolve_human_user_id,
        },
        {
          apply: false,
          ...opts,
          // Default assignee to human when opening auth issues
          assignee: opts.assignee ?? 'human',
        }
      );
    },
  };
}
