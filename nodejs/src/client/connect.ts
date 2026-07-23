/**
 * Connect facade (MCP: loxtep_connect).
 * Delegates to connectors and templates APIs — no HTTP rewrite.
 */

import type { createConnectorsApi } from './connectors.js';
import type { createTemplatesApi } from './templates.js';

export interface ConnectFacadeDeps {
  connectors: ReturnType<typeof createConnectorsApi>;
  templates: ReturnType<typeof createTemplatesApi>;
}

export function createConnectFacade(deps: ConnectFacadeDeps): {
  connectors: ConnectFacadeDeps['connectors'];
  templates: ConnectFacadeDeps['templates'];
} {
  return {
    connectors: deps.connectors,
    templates: deps.templates,
  };
}

export type ConnectFacade = ReturnType<typeof createConnectFacade>;
