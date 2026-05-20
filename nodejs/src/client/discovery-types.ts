/**
 * Discovery API types (MCP tools: search_catalog, get_evidence, get_lineage_impact, get_governance_flags, run_discovery).
 * snake_case per backend conventions.
 */

export interface DiscoverySearchOptions {
  query: string;
  type?: 'data_product' | 'workflow' | 'connection' | 'entity';
  domain_id?: string;
  tags?: string[];
  include_evidence?: boolean;
  include_lineage?: boolean;
  limit?: number;
  offset?: number;
}

export interface DiscoverySearchResultItem {
  id?: string;
  type?: string;
  name?: string;
  title?: string;
  description?: string;
  quality_score?: number | null;
  last_ingestion?: string | null;
  classification?: string | null;
  pii_fields?: string[] | null;
  last_schema_change?: string | null;
  has_breaking_changes?: boolean | null;
  downstream_count?: number | null;
  [key: string]: unknown;
}

export interface DiscoverySearchResponse {
  results?: DiscoverySearchResultItem[];
  totalCount?: number;
  [key: string]: unknown;
}

export interface EvidenceItem {
  data_product_id: string;
  quality_score?: number | null;
  quality_status?: string | null;
  last_ingestion?: string | null;
  ingestion_status?: string | null;
  classification?: string | null;
  pii_fields?: string[] | null;
}

export interface GetEvidenceResponse {
  evidence: EvidenceItem[];
}

export interface GetLineageImpactResponse {
  data_product_id: string;
  downstream_count: number | null;
  message?: string;
}

export interface GetGovernanceFlagsResponse {
  data_product_id: string;
  classification: string | null;
  pii_fields: string[] | null;
}

export interface RunDiscoveryResponse {
  message: string;
  tools: string[];
}

/** MCP tool call response envelope (content[0].text holds JSON stringified result). */
export interface McpToolCallResponse {
  success: boolean;
  data: {
    content: Array<{
      type: 'text' | 'image' | 'resource';
      text?: string;
      data?: string;
      mimeType?: string;
      uri?: string;
    }>;
  };
}
