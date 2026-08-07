import { enrichProjectListSummary } from '../../client/project-workspace-status.js';
import type { Project } from '../../client/projects-types.js';
import { toProjectListSummary } from '../../client/list-summaries.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

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
    ...overrides,
  };
}

describe('projects list enrichment', () => {
  it('keeps remote list columns and adds local/deployed when detectable', () => {
    const project = sampleProject();
    const row = {
      ...toProjectListSummary(project),
      ...enrichProjectListSummary(project, {
        cwd_project_id: PROJECT_ID,
        cwd_path: '/work/shopify-ingest',
        cwd_attach_state: 'attached',
        deployed_by_project: new Map([[PROJECT_ID, 'deployed']]),
      }),
    };

    expect(row.project_id).toBe(PROJECT_ID);
    expect(row.name).toBe('shopify-ingest');
    expect(row.github_repo_name).toBe('acme/shopify-ingest');
    expect(row.github_state).toBe('linked');
    expect(row.local_present).toBe(true);
    expect(row.local_path).toBe('/work/shopify-ingest');
    expect(row.deployed_state).toBe('deployed');
  });
});
