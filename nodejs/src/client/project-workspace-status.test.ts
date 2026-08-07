import {
  buildProjectWorkspaceStatus,
  deriveNextAction,
  enrichProjectListSummary,
  formatProjectWorkspaceStatusLines,
  toProjectListStatusEnrichment,
} from './project-workspace-status.js';
import type { Project } from './projects-types.js';
import type { Deployment } from './deployments-types.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const INSTANCE_ID = '22222222-2222-2222-2222-222222222222';

function sampleProject(overrides: Partial<Project> = {}): Project {
  return {
    project_id: PROJECT_ID,
    organization_id: '33333333-3333-3333-3333-333333333333',
    name: 'shopify-ingest',
    status: 'active',
    is_active: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
    github_repo_url: 'https://github.com/acme/shopify-ingest',
    github_repo_name: 'acme/shopify-ingest',
    github_branch: 'main',
    ...overrides,
  };
}

function sampleLocal() {
  return {
    project_id: PROJECT_ID,
    path: '/tmp/shopify-ingest',
    project_file: '/tmp/shopify-ingest/.loxtep/project.json',
    instance_id: INSTANCE_ID,
    api_url: 'https://apidev.loxtep.io',
  };
}

describe('buildProjectWorkspaceStatus', () => {
  it('distinguishes never_deployed vs deployed vs stale on one screen', () => {
    const local = sampleLocal();
    const cloud = sampleProject({
      github_last_sync_at: '2026-08-05T00:00:00.000Z',
    });

    const never = buildProjectWorkspaceStatus({
      population_depth: 'status',
      local,
      cloud,
      deployments: [],
      local_git_dirty: false,
      now_ms: Date.parse('2026-08-06T00:00:00.000Z'),
    });
    expect(never.deployed.state).toBe('never_deployed');
    expect(never.unpublished.cloud_to_deployed.dirty).toBe(true);
    expect(never.next_action).toBe('deploy');
    const neverLines = formatProjectWorkspaceStatusLines(never).join('\n');
    expect(neverLines).toContain('never deployed');
    expect(neverLines).toContain('Next:    deploy');

    const deployedRow: Deployment = {
      deployment_id: '44444444-4444-4444-4444-444444444444',
      project_id: PROJECT_ID,
      instance_id: INSTANCE_ID,
      name: 'main',
      status: 'deployed',
      created_at: '2026-08-04T00:00:00.000Z',
      updated_at: '2026-08-04T12:00:00.000Z',
    };

    const clean = buildProjectWorkspaceStatus({
      population_depth: 'status',
      local,
      cloud: sampleProject({
        github_last_sync_at: '2026-08-03T00:00:00.000Z',
      }),
      deployments: [deployedRow],
      local_git_dirty: false,
      now_ms: Date.parse('2026-08-06T00:00:00.000Z'),
    });
    expect(clean.deployed.state).toBe('deployed');
    expect(clean.unpublished.cloud_to_deployed.dirty).toBe(false);
    expect(clean.next_action).toBe('none');
    expect(formatProjectWorkspaceStatusLines(clean).join('\n')).toMatch(/Deploy:\s+deployed/);

    const stale = buildProjectWorkspaceStatus({
      population_depth: 'status',
      local,
      cloud,
      deployments: [deployedRow],
      local_git_dirty: false,
      now_ms: Date.parse('2026-08-06T00:00:00.000Z'),
    });
    expect(stale.deployed.state).toBe('stale');
    expect(stale.unpublished.cloud_to_deployed.dirty).toBe(true);
    expect(stale.next_action).toBe('deploy');
    expect(formatProjectWorkspaceStatusLines(stale).join('\n')).toContain('stale');
  });

  it('prefers push when local→cloud is dirty even if never deployed', () => {
    const status = buildProjectWorkspaceStatus({
      population_depth: 'status',
      local: sampleLocal(),
      cloud: sampleProject(),
      deployments: [],
      local_git_dirty: true,
    });
    expect(status.next_action).toBe('push');
    expect(status.unpublished.local_to_cloud.dirty).toBe(true);
  });
});

describe('enrichProjectListSummary', () => {
  it('marks github + local on happy path; deployed when map provided', () => {
    const project = sampleProject();
    const row = enrichProjectListSummary(project, {
      cwd_project_id: PROJECT_ID,
      cwd_path: '/tmp/shopify-ingest',
      cwd_attach_state: 'attached',
      deployed_by_project: new Map([[PROJECT_ID, 'deployed']]),
    });
    expect(row.github_state).toBe('linked');
    expect(row.local_present).toBe(true);
    expect(row.local_path).toBe('/tmp/shopify-ingest');
    expect(row.attach_state).toBe('attached');
    expect(row.deployed_state).toBe('deployed');

    const remoteOnly = enrichProjectListSummary(sampleProject({ github_repo_url: undefined, github_repo_name: undefined }), {
      cwd_project_id: '99999999-9999-9999-9999-999999999999',
    });
    expect(remoteOnly.local_present).toBe(false);
    expect(remoteOnly.github_state).toBe('unbound');
    expect(remoteOnly.deployed_state).toBeUndefined();
  });
});

describe('toProjectListStatusEnrichment + deriveNextAction', () => {
  it('projects enrichment from status and attach hint', () => {
    const status = buildProjectWorkspaceStatus({
      population_depth: 'status',
      local: { ...sampleLocal(), instance_id: null, api_url: null },
      cloud: sampleProject(),
      deployments: [],
      local_git_dirty: false,
    });
    expect(status.local.attach_state).toBe('unattached');
    expect(deriveNextAction({
      local_present: true,
      attach_state: 'unattached',
      github_state: 'linked',
      deployed_state: 'never_deployed',
      local_to_cloud_dirty: false,
      cloud_to_deployed_dirty: true,
    })).toBe('attach');

    const enrichment = toProjectListStatusEnrichment(status);
    expect(enrichment.project_id).toBe(PROJECT_ID);
    expect(enrichment.github_state).toBe('linked');
    expect(enrichment.deployed_state).toBe('never_deployed');
  });
});
