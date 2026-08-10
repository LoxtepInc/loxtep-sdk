/**
 * Context facade (MCP: loxtep_context).
 * Delegates to process intelligence, procedures, activity, and agent-workspace reads.
 */

import type { createProcessIntelligenceApi } from './process-intelligence.js';
import type { createProceduresApi } from './procedures.js';
import type { ActivityApi } from './activity.js';
import type { IssuesApi, GoalsApi, WorkstreamsApi } from './agent-workspace.js';

export interface ContextFacadeDeps {
  process_intelligence: ReturnType<typeof createProcessIntelligenceApi>;
  procedures: ReturnType<typeof createProceduresApi>;
  activity: ActivityApi;
  issues: IssuesApi;
  goals: GoalsApi;
  workstreams: WorkstreamsApi;
}

export function createContextFacade(deps: ContextFacadeDeps): {
  process_intelligence: ContextFacadeDeps['process_intelligence'];
  procedures: ContextFacadeDeps['procedures'];
  activity: ContextFacadeDeps['activity'];
  issues: ContextFacadeDeps['issues'];
  goals: ContextFacadeDeps['goals'];
  workstreams: ContextFacadeDeps['workstreams'];
} {
  return {
    process_intelligence: deps.process_intelligence,
    procedures: deps.procedures,
    activity: deps.activity,
    issues: deps.issues,
    goals: deps.goals,
    workstreams: deps.workstreams,
  };
}

export type ContextFacade = ReturnType<typeof createContextFacade>;
