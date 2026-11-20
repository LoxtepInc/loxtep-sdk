/**
 * Agent workspace API (LOX-1250 / loxtep#4801).
 * Thin wraps for MCP loxtep_context issues, goals, workstreams.
 *
 *   GET  /agent-orchestration/organizations/{org}/issues
 *   POST /agent-orchestration/organizations/{org}/issues
 *   GET  /agent-orchestration/issues/{issue_id}
 *   GET  /agent-orchestration/organizations/{org}/goals
 *   GET  /agent-orchestration/goals/{goal_id}
 *   GET  /agent-orchestration/organizations/{org}/workstreams
 *   GET  /agent-orchestration/workstreams/{workstream_id}
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  AgentWorkspaceApiDeps,
  AgentWorkspaceGoal,
  AgentWorkspaceIssue,
  AgentWorkspaceListResponse,
  AgentWorkspaceWorkstream,
  CreateIssueInput,
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

function issueMatchesDedupeKey(
  issue: AgentWorkspaceIssue,
  dedupeKey: string
): boolean {
  if (issue.dedupe_key === dedupeKey) return true;
  const desc = issue.description ?? '';
  if (desc.includes(dedupeKey)) return true;
  try {
    const marker = 'Context (JSON):';
    const idx = desc.indexOf(marker);
    if (idx >= 0) {
      const json = JSON.parse(desc.slice(idx + marker.length).trim()) as {
        dedupe_key?: string;
      };
      if (json.dedupe_key === dedupeKey) return true;
    }
  } catch {
    // ignore parse errors
  }
  return false;
}

function buildCreateDescription(input: CreateIssueInput): string | null | undefined {
  let description = input.description;
  if (input.context || input.dedupe_key) {
    const context = {
      ...(input.context ?? {}),
      ...(input.dedupe_key ? { dedupe_key: input.dedupe_key } : {}),
    };
    const block = `\n\n---\nContext (JSON): ${JSON.stringify(context, null, 2)}`;
    if (description && description.includes('Context (JSON):')) {
      return description;
    }
    description = `${description ?? ''}${block}`.trim();
  }
  return description;
}

export type IssuesApi = {
  list: (filters?: IssuesListFilters) => Promise<AgentWorkspaceListResponse<AgentWorkspaceIssue>>;
  /** MCP op name alias for list. */
  list_issues: (
    filters?: IssuesListFilters
  ) => Promise<AgentWorkspaceListResponse<AgentWorkspaceIssue>>;
  get: (issue_id: string) => Promise<AgentWorkspaceIssue>;
  get_issue: (issue_id: string) => Promise<AgentWorkspaceIssue>;
  create: (input: CreateIssueInput) => Promise<AgentWorkspaceIssue>;
  /** MCP op name alias for create. */
  create_issue: (input: CreateIssueInput) => Promise<AgentWorkspaceIssue>;
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
 * Create agent-workspace surfaces (issues / goals / workstreams).
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
    async create(input: CreateIssueInput) {
      if (!input?.title?.trim()) throw new Error('title is required');
      const org = requireOrg(deps, input.organization_id);

      if (input.dedupe_key) {
        const open = await this.list({
          organization_id: org,
          status: 'open',
          page_size: 100,
        });
        const existing = open.items.find((issue) =>
          issueMatchesDedupeKey(issue, input.dedupe_key!)
        );
        if (existing) return existing;
      }

      const body: Record<string, unknown> = {
        title: input.title.trim(),
        status: input.status ?? 'open',
      };
      const description = buildCreateDescription(input);
      if (description !== undefined) body.description = description;
      if (input.workstream_id !== undefined) body.workstream_id = input.workstream_id;
      if (input.goal_id !== undefined) body.goal_id = input.goal_id;
      if (input.parent_issue_id !== undefined) {
        body.parent_issue_id = input.parent_issue_id;
      }
      if (input.priority !== undefined) body.priority = input.priority;
      if (input.assignee_agent_id !== undefined) {
        body.assignee_agent_id = input.assignee_agent_id;
      }
      if (input.assignee_user_id !== undefined) {
        body.assignee_user_id = input.assignee_user_id;
      }
      if (input.label_ids !== undefined) body.label_ids = input.label_ids;
      // Forward-compat if platform starts accepting dedupe_key on REST
      if (input.dedupe_key) body.dedupe_key = input.dedupe_key;

      const res = await http.post(
        `${AO_PREFIX}/organizations/${encodeURIComponent(org)}/issues`,
        body
      );
      return unwrapData<AgentWorkspaceIssue>(res);
    },
    create_issue(input: CreateIssueInput) {
      return this.create(input);
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
