/**
 * Heuristic name/url → first-party Loxtep connector type (P0/P1).
 * P2 mcp-http is out of scope — HTTP MCPs map to rest-api.
 */

export interface KnownConnectorMatch {
  connector_type: string;
  ingest_fit: 'high' | 'medium';
  /** When true, MCP URL is ignored at runtime (first-party OAuth type). */
  first_party: boolean;
  reason: string;
}

const NAME_PATTERNS: Array<{
  pattern: RegExp;
  connector_type: string;
  ingest_fit: 'high' | 'medium';
  first_party: boolean;
}> = [
  { pattern: /shopify/i, connector_type: 'shopify', ingest_fit: 'high', first_party: true },
  { pattern: /github/i, connector_type: 'github', ingest_fit: 'high', first_party: true },
  { pattern: /stripe/i, connector_type: 'stripe', ingest_fit: 'high', first_party: true },
  { pattern: /salesforce/i, connector_type: 'salesforce', ingest_fit: 'high', first_party: true },
  { pattern: /hubspot/i, connector_type: 'hubspot', ingest_fit: 'high', first_party: true },
  { pattern: /slack/i, connector_type: 'slack', ingest_fit: 'medium', first_party: true },
  { pattern: /notion/i, connector_type: 'notion', ingest_fit: 'medium', first_party: true },
  { pattern: /jira|atlassian/i, connector_type: 'jira', ingest_fit: 'medium', first_party: true },
  { pattern: /linear/i, connector_type: 'linear', ingest_fit: 'medium', first_party: true },
  { pattern: /databricks/i, connector_type: 'databricks', ingest_fit: 'high', first_party: true },
  { pattern: /snowflake/i, connector_type: 'snowflake', ingest_fit: 'high', first_party: true },
  { pattern: /netsuite/i, connector_type: 'netsuite', ingest_fit: 'high', first_party: true },
];

const HOST_PATTERNS: Array<{
  pattern: RegExp;
  connector_type: string;
  ingest_fit: 'high' | 'medium';
  first_party: boolean;
}> = [
  { pattern: /shopify\.com/i, connector_type: 'shopify', ingest_fit: 'high', first_party: true },
  { pattern: /github\.com|api\.github/i, connector_type: 'github', ingest_fit: 'high', first_party: true },
  { pattern: /stripe\.com/i, connector_type: 'stripe', ingest_fit: 'high', first_party: true },
];

/** Tool-name hints that look like list/get/resource ingest (vs pure actions). */
const INGEST_TOOL_HINTS =
  /^(list_|get_|search_|fetch_|read_|query_|find_|describe_|resources)/i;
const ACTION_TOOL_HINTS =
  /^(create_|update_|delete_|write_|send_|post_|put_|patch_|run_|execute_|call_)/i;

export function matchKnownConnector(input: {
  name: string;
  url?: string;
}): KnownConnectorMatch | null {
  for (const rule of NAME_PATTERNS) {
    if (rule.pattern.test(input.name)) {
      return {
        connector_type: rule.connector_type,
        ingest_fit: rule.ingest_fit,
        first_party: rule.first_party,
        reason: `Name matches first-party connector type ${rule.connector_type}`,
      };
    }
  }
  if (input.url) {
    for (const rule of HOST_PATTERNS) {
      if (rule.pattern.test(input.url)) {
        return {
          connector_type: rule.connector_type,
          ingest_fit: rule.ingest_fit,
          first_party: rule.first_party,
          reason: `URL host matches first-party connector type ${rule.connector_type}`,
        };
      }
    }
  }
  return null;
}

export function scoreIngestFit(toolNames?: string[]): 'high' | 'medium' | 'low' | 'none' {
  if (!toolNames || toolNames.length === 0) return 'medium';
  let ingest = 0;
  let action = 0;
  for (const name of toolNames) {
    if (INGEST_TOOL_HINTS.test(name)) ingest += 1;
    else if (ACTION_TOOL_HINTS.test(name)) action += 1;
  }
  if (ingest === 0 && action > 0) return 'none';
  if (ingest >= 2) return 'high';
  if (ingest >= 1) return 'medium';
  if (action > ingest) return 'low';
  return 'medium';
}

/** Default type for hosted HTTP/SSE MCP when no first-party match (P2 mcp-http deferred). */
export const GENERIC_HTTP_CONNECTOR_TYPE = 'rest-api';
