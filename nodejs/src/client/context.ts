/**
 * Context facade (MCP: loxtep_context).
 * Delegates to process intelligence, procedures, and activity APIs.
 */

import type { createProcessIntelligenceApi } from './process-intelligence.js';
import type { createProceduresApi } from './procedures.js';
import type { ActivityApi } from './activity.js';

export interface ContextFacadeDeps {
  process_intelligence: ReturnType<typeof createProcessIntelligenceApi>;
  procedures: ReturnType<typeof createProceduresApi>;
  activity: ActivityApi;
}

export function createContextFacade(deps: ContextFacadeDeps): {
  process_intelligence: ContextFacadeDeps['process_intelligence'];
  procedures: ContextFacadeDeps['procedures'];
  activity: ContextFacadeDeps['activity'];
} {
  return {
    process_intelligence: deps.process_intelligence,
    procedures: deps.procedures,
    activity: deps.activity,
  };
}

export type ContextFacade = ReturnType<typeof createContextFacade>;
