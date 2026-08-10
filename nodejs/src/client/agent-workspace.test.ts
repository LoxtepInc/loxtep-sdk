import { createAgentWorkspaceApi } from './agent-workspace.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createAgentWorkspaceApi LOX-1250', () => {
  const issue = {
    issue_id: 'iss-1',
    title: 'Ship read path',
    status: 'open',
  };
  const goal = {
    goal_id: 'goal-1',
    title: 'Agent workspace parity',
    status: 'active',
  };
  const workstream = {
    workstream_id: 'ws-1',
    name: 'Phase A SDK',
    status: 'active',
  };

  it('issues.list / list_issues GET .../organizations/:org/issues with filters', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { items: [issue], total: 1 } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createAgentWorkspaceApi(http, { organization_id: 'org1' });
    const result = await api.issues.list({
      status: 'open',
      goal_id: 'goal-1',
      workstream_id: 'ws-1',
      assignee_agent_id: 'agent-9',
      page: 2,
      page_size: 10,
    });

    expect(capturedPath).toBe(
      '/agent-orchestration/organizations/org1/issues?workstream_id=ws-1&goal_id=goal-1&status=open&assignee_agent_id=agent-9&page=2&page_size=10'
    );
    expect(result.items).toEqual([issue]);
    expect(result.total).toBe(1);

    capturedPath = null;
    await api.issues.list_issues({ status: 'done' });
    expect(capturedPath).toBe(
      '/agent-orchestration/organizations/org1/issues?status=done'
    );
  });

  it('issues.get / get_issue GET /agent-orchestration/issues/:id', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: issue };
      },
    } as unknown as LoxtepHttpClient;

    const api = createAgentWorkspaceApi(http);
    const result = await api.issues.get('iss-1');
    expect(capturedPath).toBe('/agent-orchestration/issues/iss-1');
    expect(result).toEqual(issue);

    capturedPath = null;
    await api.issues.get_issue('iss-2');
    expect(capturedPath).toBe('/agent-orchestration/issues/iss-2');
  });

  it('goals.list / get with MCP aliases', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        if (path.includes('/goals/')) {
          return { success: true as const, data: goal };
        }
        return { success: true as const, data: { goals: [goal] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createAgentWorkspaceApi(http, { organization_id: 'org1' });
    const listed = await api.goals.list_goals({ page: 1, page_size: 20 });
    expect(capturedPath).toBe(
      '/agent-orchestration/organizations/org1/goals?page=1&page_size=20'
    );
    expect(listed.items).toEqual([goal]);

    const got = await api.goals.get_goal('goal-1');
    expect(capturedPath).toBe('/agent-orchestration/goals/goal-1');
    expect(got).toEqual(goal);
  });

  it('workstreams.list / get with MCP aliases', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        if (path.includes('/workstreams/')) {
          return { success: true as const, data: workstream };
        }
        return { success: true as const, data: { items: [workstream] } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createAgentWorkspaceApi(http, { organization_id: 'org1' });
    const listed = await api.workstreams.list();
    expect(capturedPath).toBe(
      '/agent-orchestration/organizations/org1/workstreams'
    );
    expect(listed.items).toEqual([workstream]);

    const got = await api.workstreams.get_workstream('ws-1');
    expect(capturedPath).toBe('/agent-orchestration/workstreams/ws-1');
    expect(got).toEqual(workstream);
  });

  it('requires organization_id for list calls', async () => {
    const http = {
      get: async () => ({ success: true as const, data: { items: [] } }),
    } as unknown as LoxtepHttpClient;
    const api = createAgentWorkspaceApi(http);
    await expect(api.issues.list()).rejects.toThrow(/organization_id/);
    await expect(api.goals.list()).rejects.toThrow(/organization_id/);
    await expect(api.workstreams.list()).rejects.toThrow(/organization_id/);
  });
});
