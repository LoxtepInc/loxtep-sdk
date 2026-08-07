import {
  ProjectListStatusEnrichmentSchema,
  ProjectWorkspaceStatusSchema,
  PROJECT_WORKSPACE_STATUS_FIELD_COST,
  STATUS_POPULATION_DEPTH_COST_CEILING,
} from './project-workspace-status-types.js';

describe('ProjectWorkspaceStatusSchema', () => {
  const minimalStatus = {
    schema_version: 1 as const,
    population_depth: 'status' as const,
    project_id: '11111111-1111-1111-1111-111111111111',
    display_name: 'demo',
    local: {
      presence: 'present' as const,
      path: '/tmp/demo',
      project_file: '/tmp/demo/.loxtep/project.json',
      known_local: false,
      attach_state: 'attached' as const,
      instance_id: '22222222-2222-2222-2222-222222222222',
      api_url: 'https://example.test',
      project_id: '11111111-1111-1111-1111-111111111111',
    },
    cloud: {
      presence: 'present' as const,
      project_id: '11111111-1111-1111-1111-111111111111',
      organization_id: '33333333-3333-3333-3333-333333333333',
      name: 'demo',
      status: 'active',
      github: {
        state: 'linked' as const,
        url: 'https://github.com/acme/demo',
        name: 'acme/demo',
        branch: 'main',
        last_sync_at: null,
      },
      workspace_revision: null,
      workspace_updated_at: null,
    },
    deployed: {
      presence: 'present' as const,
      state: 'deployed' as const,
      instance_id: '22222222-2222-2222-2222-222222222222',
      deployment_id: '44444444-4444-4444-4444-444444444444',
      deployment_status: 'deployed',
      last_deployed_at: '2026-08-01T12:00:00.000Z',
      age_seconds: 3600,
    },
    unpublished: {
      local_to_cloud: { dirty: false, summary: 'In sync', changed_count: null },
      cloud_to_deployed: { dirty: false, summary: 'In sync', changed_count: null },
    },
    next_action: 'none' as const,
  };

  it('parses a full status payload and defaults notes to []', () => {
    const parsed = ProjectWorkspaceStatusSchema.parse(minimalStatus);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.notes).toEqual([]);
    expect(parsed.cloud.github.state).toBe('linked');
    expect(parsed.deployed.age_seconds).toBe(3600);
    expect(parsed.unpublished.local_to_cloud.dirty).toBe(false);
  });

  it('allows dirty null when unpublished was not computed', () => {
    const parsed = ProjectWorkspaceStatusSchema.parse({
      ...minimalStatus,
      population_depth: 'summary',
      unpublished: {
        local_to_cloud: { dirty: null, summary: null, changed_count: null },
        cloud_to_deployed: { dirty: null, summary: null, changed_count: null },
      },
    });
    expect(parsed.unpublished.local_to_cloud.dirty).toBeNull();
  });

  it('rejects camelCase field names (contract is snake_case)', () => {
    const result = ProjectWorkspaceStatusSchema.safeParse({
      ...minimalStatus,
      projectId: minimalStatus.project_id,
      project_id: undefined,
    });
    expect(result.success).toBe(false);
  });
});

describe('ProjectListStatusEnrichmentSchema', () => {
  it('parses lean list enrichment', () => {
    const parsed = ProjectListStatusEnrichmentSchema.parse({
      project_id: 'p1',
      local_present: true,
      local_path: '/tmp/p1',
      attach_state: 'unattached',
      github_state: 'unbound',
      deployed_state: 'never_deployed',
      local_to_cloud_dirty: null,
      cloud_to_deployed_dirty: null,
    });
    expect(parsed.github_state).toBe('unbound');
    expect(parsed.deployed_state).toBe('never_deployed');
  });
});

describe('population cost map', () => {
  it('keeps summary ceiling at cheap and marks unpublished counts expensive', () => {
    expect(STATUS_POPULATION_DEPTH_COST_CEILING.summary).toBe('cheap');
    expect(STATUS_POPULATION_DEPTH_COST_CEILING.status).toBe('moderate');
    expect(STATUS_POPULATION_DEPTH_COST_CEILING.unpublished).toBe('expensive');
    expect(PROJECT_WORKSPACE_STATUS_FIELD_COST['local.presence']).toBe('cheap');
    expect(PROJECT_WORKSPACE_STATUS_FIELD_COST['deployed.state']).toBe('moderate');
    expect(
      PROJECT_WORKSPACE_STATUS_FIELD_COST['unpublished.local_to_cloud.changed_count']
    ).toBe('expensive');
  });
});
