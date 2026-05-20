/**
 * Discovery API (MCP tools: search_catalog, get_evidence, get_lineage_impact, get_governance_flags, run_discovery).
 * Calls POST /ai/mcp/tools/call; results are access-filtered when user context is present.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  DiscoverySearchOptions,
  DiscoverySearchResponse,
  GetEvidenceResponse,
  GetLineageImpactResponse,
  GetGovernanceFlagsResponse,
  RunDiscoveryResponse,
  McpToolCallResponse,
} from './discovery-types.js';

const MCP_TOOLS_PATH = '/ai/mcp/tools/call';

function parseToolResponse<T>(res: McpToolCallResponse): T {
  const first = res?.data?.content?.[0];
  if (first?.type === 'text' && typeof first.text === 'string') {
    try {
      return JSON.parse(first.text) as T;
    } catch {
      return { raw: first.text } as unknown as T;
    }
  }
  return res as unknown as T;
}

async function callTool<T>(
  http: LoxtepHttpClient,
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const res = await http.post<McpToolCallResponse>(MCP_TOOLS_PATH, { name, arguments: args });
  return parseToolResponse<T>(res);
}

export function createDiscoveryApi(http: LoxtepHttpClient): {
  search: (options: DiscoverySearchOptions) => Promise<DiscoverySearchResponse>;
  getEvidence: (dataProductIds: string[]) => Promise<GetEvidenceResponse>;
  getLineageImpact: (dataProductId: string) => Promise<GetLineageImpactResponse>;
  getGovernanceFlags: (dataProductId: string) => Promise<GetGovernanceFlagsResponse>;
  runDiscovery: () => Promise<RunDiscoveryResponse>;
} {
  return {
    async search(options: DiscoverySearchOptions): Promise<DiscoverySearchResponse> {
      const args: Record<string, unknown> = {
        query: options.query,
        type: options.type,
        domain_id: options.domain_id,
        tags: options.tags,
        include_evidence: options.include_evidence,
        include_lineage: options.include_lineage,
        limit: options.limit,
        offset: options.offset,
      };
      return callTool<DiscoverySearchResponse>(http, 'search_catalog', args);
    },

    async getEvidence(dataProductIds: string[]): Promise<GetEvidenceResponse> {
      return callTool<GetEvidenceResponse>(http, 'get_evidence', {
        data_product_ids: dataProductIds,
      });
    },

    async getLineageImpact(dataProductId: string): Promise<GetLineageImpactResponse> {
      return callTool<GetLineageImpactResponse>(http, 'get_lineage_impact', {
        data_product_id: dataProductId,
      });
    },

    async getGovernanceFlags(dataProductId: string): Promise<GetGovernanceFlagsResponse> {
      return callTool<GetGovernanceFlagsResponse>(http, 'get_governance_flags', {
        data_product_id: dataProductId,
      });
    },

    async runDiscovery(): Promise<RunDiscoveryResponse> {
      return callTool<RunDiscoveryResponse>(http, 'run_discovery', {});
    },
  };
}
