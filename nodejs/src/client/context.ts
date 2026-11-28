import type { LoxtepHttpClient } from "../http/client.js";
import { createSemanticGroundingApi } from "./semantic-grounding.js";
/**
 * Context facade (MCP: loxtep_context).
 * Delegates to process intelligence, procedures, activity, and agent-workspace reads.
 */

import type { createProcessIntelligenceApi } from "./process-intelligence.js";
import type { createProceduresApi } from "./procedures.js";
import type { ActivityApi } from "./activity.js";
import type { IssuesApi, GoalsApi, WorkstreamsApi } from "./agent-workspace.js";

export interface ContextFacadeDeps {
  http: LoxtepHttpClient;
  process_intelligence: ReturnType<typeof createProcessIntelligenceApi>;
  procedures: ReturnType<typeof createProceduresApi>;
  activity: ActivityApi;
  issues: IssuesApi;
  goals: GoalsApi;
  workstreams: WorkstreamsApi;
}

export function createContextFacade(deps: ContextFacadeDeps): ReturnType<
  typeof createSemanticGroundingApi
> & {
  process_intelligence: ContextFacadeDeps["process_intelligence"];
  procedures: ContextFacadeDeps["procedures"];
  activity: ContextFacadeDeps["activity"];
  issues: ContextFacadeDeps["issues"];
  goals: ContextFacadeDeps["goals"];
  workstreams: ContextFacadeDeps["workstreams"];
} {
  return {
    ...createSemanticGroundingApi(deps.http),
    process_intelligence: deps.process_intelligence,
    procedures: deps.procedures,
    activity: deps.activity,
    issues: deps.issues,
    goals: deps.goals,
    workstreams: deps.workstreams,
  };
}

export type ContextFacade = ReturnType<typeof createContextFacade>;
