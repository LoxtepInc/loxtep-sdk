/**
 * Agent workspace types (LOX-1250 / loxtep#4801).
 * MCP: loxtep_context list/get/create issues, goals, workstreams.
 * REST: /agent-orchestration/...
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
  assignee_user_id?: string | null;
  organization_id?: string;
  dedupe_key?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Input for POST /agent-orchestration/organizations/:org/issues (MCP create_issue). */
export interface CreateIssueInput {
  title: string;
  description?: string | null;
  workstream_id?: string | null;
  goal_id?: string | null;
  parent_issue_id?: string | null;
  status?: string;
  priority?: string | null;
  assignee_agent_id?: string | null;
  assignee_user_id?: string | null;
  label_ids?: string[];
  organization_id?: string;
  /**
   * Client-side + description-embedded dedupe key (e.g. connector-auth:org:connector).
   * Platform REST schema currently strips unknown fields; SDK lists open issues and
   * reuses a match when description/context contains this key.
   */
  dedupe_key?: string;
  /** Merged into description as Context (JSON) when provided. */
  context?: Record<string, unknown>;
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
