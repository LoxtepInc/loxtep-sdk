/**
 * Agent workspace types (LOX-1250).
 * MCP: loxtep_context list/get issues, goals, workstreams.
 * REST: /agent-orchestration/... (reads only — writes deferred).
 */

export interface AgentWorkspaceApiDeps {
  organization_id?: string;
}

/** Shared list envelope from agent-orchestration list endpoints. */
export interface AgentWorkspaceListResponse<T> {
  items: T[];
  pagination?: unknown;
  total?: number;
  [key: string]: unknown;
}

export interface IssuesListFilters {
  organization_id?: string;
  workstream_id?: string;
  goal_id?: string;
  status?: string;
  assignee_agent_id?: string;
  page?: number;
  page_size?: number;
}

export interface GoalsListFilters {
  organization_id?: string;
  page?: number;
  page_size?: number;
}

export interface WorkstreamsListFilters {
  organization_id?: string;
  page?: number;
  page_size?: number;
}

/** Issue row/detail — platform may add fields. */
export interface AgentWorkspaceIssue {
  issue_id?: string;
  id?: string;
  title?: string;
  status?: string;
  description?: string | null;
  goal_id?: string | null;
  workstream_id?: string | null;
  assignee_agent_id?: string | null;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface AgentWorkspaceGoal {
  goal_id?: string;
  id?: string;
  title?: string;
  name?: string;
  status?: string;
  description?: string | null;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface AgentWorkspaceWorkstream {
  workstream_id?: string;
  id?: string;
  title?: string;
  name?: string;
  status?: string;
  description?: string | null;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}
