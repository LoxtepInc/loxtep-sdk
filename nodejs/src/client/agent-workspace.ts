/**
 * Agent workspace read API (LOX-1250).
 * Thin wraps for MCP loxtep_context list/get issues, goals, workstreams.
 *
 *   GET /agent-orchestration/organizations/{org}/issues
 *   GET /agent-orchestration/issues/{issue_id}
 *   GET /agent-orchestration/organizations/{org}/goals
 *   GET /agent-orchestration/goals/{goal_id}
 *   GET /agent-orchestration/organizations/{org}/workstreams
 *   GET /agent-orchestration/workstreams/{workstream_id}
 *
 * Writes (create/update issue, create goal, create/update workstream,
 * add_issue_comment) are deferred — use MCP `loxtep_context` until shipped.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  AgentWorkspaceApiDeps,
  AgentWorkspaceGoal,
  AgentWorkspaceIssue,
  AgentWorkspaceListResponse,
  AgentWorkspaceWorkstream,
  GoalsListFilters,
  IssuesListFilters,
  WorkstreamsListFilters,
} from './agent-workspace-types.js';

const AO_PREFIX = '/agent-orchestration';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function requireOrg(deps: AgentWorkspaceApiDeps, override?: string): string {
  const org = override ?? deps.organization_id;
  if (!org) {
    throw new Error(
      'organization_id is required for agent workspace calls (set it on the client or pass it explicitly)'
    );
  }
  return org;
}

function buildQuery(
  entries: Array<[string, string | number | undefined]>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function normalizeList<T>(
  data: unknown,
  collectionKeys: string[]
): AgentWorkspaceListResponse<T> {
  if (Array.isArray(data)) {
    return { items: data as T[], total: data.length };
  }
  const obj = (data ?? {}) as Record<string, unknown>;
  let items: T[] = [];
  if (Array.isArray(obj.items)) {
    items = obj.items as T[];
  } else {
    for (const key of collectionKeys) {
      if (Array.isArray(obj[key])) {
        items = obj[key] as T[];
        break;
      }
    }
  }
  const out: AgentWorkspaceListResponse<T> = {
    items,
    pagination: obj.pagination,
  };
  if (typeof obj.total === 'number') out.total = obj.total;
  return out;
}

export type IssuesApi = {
  list: (filters?: IssuesListFilters) => Promise<AgentWorkspaceListResponse<AgentWorkspaceIssue>>;
  /** MCP op name alias for list. */
  list_issues: (
    filters?: IssuesListFilters
  ) => Promise<AgentWorkspaceListResponse<AgentWorkspaceIssue>>;
  get: (issue_id: string) => Promise<AgentWorkspaceIssue>;
  get_issue: (issue_id: string) => Promise<AgentWorkspaceIssue>;
};

export type GoalsApi = {
  list: (filters?: GoalsListFilters) => Promise<AgentWorkspaceListResponse<AgentWorkspaceGoal>>;
  list_goals: (
    filters?: GoalsListFilters
  ) => Promise<AgentWorkspaceListResponse<AgentWorkspaceGoal>>;
  get: (goal_id: string) => Promise<AgentWorkspaceGoal>;
  get_goal: (goal_id: string) => Promise<AgentWorkspaceGoal>;
};

export type WorkstreamsApi = {
  list: (
    filters?: WorkstreamsListFilters
  ) => Promise<AgentWorkspaceListResponse<AgentWorkspaceWorkstream>>;
  list_workstreams: (
    filters?: WorkstreamsListFilters
  ) => Promise<AgentWorkspaceListResponse<AgentWorkspaceWorkstream>>;
  get: (workstream_id: string) => Promise<AgentWorkspaceWorkstream>;
  get_workstream: (workstream_id: string) => Promise<AgentWorkspaceWorkstream>;
};

export type AgentWorkspaceApi = {
  issues: IssuesApi;
  goals: GoalsApi;
  workstreams: WorkstreamsApi;
};

/**
 * Create agent-workspace read surfaces (issues / goals / workstreams).
 */
export function createAgentWorkspaceApi(
  http: LoxtepHttpClient,
  deps: AgentWorkspaceApiDeps = {}
): AgentWorkspaceApi {
  const issues: IssuesApi = {
    async list(filters: IssuesListFilters = {}) {
      const org = requireOrg(deps, filters.organization_id);
      const qs = buildQuery([
        ['workstream_id', filters.workstream_id],
        ['goal_id', filters.goal_id],
        ['status', filters.status],
        ['assignee_agent_id', filters.assignee_agent_id],
        ['page', filters.page],
        ['page_size', filters.page_size],
      ]);
      const res = await http.get(
        `${AO_PREFIX}/organizations/${encodeURIComponent(org)}/issues${qs}`
      );
      return normalizeList<AgentWorkspaceIssue>(unwrapData(res), ['issues']);
    },
    list_issues(filters?: IssuesListFilters) {
      return this.list(filters);
    },
    async get(issue_id: string) {
      if (!issue_id) throw new Error('issue_id is required');
      const res = await http.get(
        `${AO_PREFIX}/issues/${encodeURIComponent(issue_id)}`
      );
      return unwrapData<AgentWorkspaceIssue>(res);
    },
    get_issue(issue_id: string) {
      return this.get(issue_id);
    },
  };

  const goals: GoalsApi = {
    async list(filters: GoalsListFilters = {}) {
      const org = requireOrg(deps, filters.organization_id);
      const qs = buildQuery([
        ['page', filters.page],
        ['page_size', filters.page_size],
      ]);
      const res = await http.get(
        `${AO_PREFIX}/organizations/${encodeURIComponent(org)}/goals${qs}`
      );
      return normalizeList<AgentWorkspaceGoal>(unwrapData(res), ['goals']);
    },
    list_goals(filters?: GoalsListFilters) {
      return this.list(filters);
    },
    async get(goal_id: string) {
      if (!goal_id) throw new Error('goal_id is required');
      const res = await http.get(`${AO_PREFIX}/goals/${encodeURIComponent(goal_id)}`);
      return unwrapData<AgentWorkspaceGoal>(res);
    },
    get_goal(goal_id: string) {
      return this.get(goal_id);
    },
  };

  const workstreams: WorkstreamsApi = {
    async list(filters: WorkstreamsListFilters = {}) {
      const org = requireOrg(deps, filters.organization_id);
      const qs = buildQuery([
        ['page', filters.page],
        ['page_size', filters.page_size],
      ]);
      const res = await http.get(
        `${AO_PREFIX}/organizations/${encodeURIComponent(org)}/workstreams${qs}`
      );
      return normalizeList<AgentWorkspaceWorkstream>(unwrapData(res), [
        'workstreams',
      ]);
    },
    list_workstreams(filters?: WorkstreamsListFilters) {
      return this.list(filters);
    },
    async get(workstream_id: string) {
      if (!workstream_id) throw new Error('workstream_id is required');
      const res = await http.get(
        `${AO_PREFIX}/workstreams/${encodeURIComponent(workstream_id)}`
      );
      return unwrapData<AgentWorkspaceWorkstream>(res);
    },
    get_workstream(workstream_id: string) {
      return this.get(workstream_id);
    },
  };

  return { issues, goals, workstreams };
}
