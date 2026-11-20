/**
 * Connect facade (MCP: loxtep_connect + local MCP discovery).
 * Delegates to connectors, templates, and discovery APIs — no HTTP rewrite.
 */

import type { createConnectorsApi } from './connectors.js';
import type { createTemplatesApi } from './templates.js';
import type { McpDiscoveryApi } from './mcp-discovery.js';

export interface ConnectFacadeDeps {
  connectors: ReturnType<typeof createConnectorsApi>;
  templates: ReturnType<typeof createTemplatesApi>;
  discovery: McpDiscoveryApi;
}

export function createConnectFacade(deps: ConnectFacadeDeps): {
  connectors: ConnectFacadeDeps['connectors'];
  templates: ConnectFacadeDeps['templates'];
  discovery: ConnectFacadeDeps['discovery'];
} {
  return {
    connectors: deps.connectors,
    templates: deps.templates,
    discovery: deps.discovery,
  };
}

export type ConnectFacade = ReturnType<typeof createConnectFacade>;
