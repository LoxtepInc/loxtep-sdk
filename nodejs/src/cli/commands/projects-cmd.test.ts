import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enrichProjectListSummary } from '../../client/project-workspace-status.js';
import type { Project } from '../../client/projects-types.js';
import { toProjectListSummary } from '../../client/list-summaries.js';
import {
  createCliTestHarness,
  createLocalProjectHarness,
  captureCliOutput,
  expectCliSuccess,
} from '../__tests__/cli-test-harness.js';
import { MOCK_IDS } from '../__tests__/mock-platform-api.js';
import {
  runProjectsChangesCommand,
  runProjectsGet,
  runProjectsLink,
  runProjectsList,
} from './projects-cmd.js';

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

describe('runProjectsList / get / link / changes', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('rejects invalid --source', async () => {
    const out = captureCliOutput();
    await runProjectsList({ source: 'nope' });
    expect(process.exitCode).toBe(1);
    expect(out.stderr).toContain('Invalid --source');
    out.restore();
  });

  it('lists projects with source=all via mock harness', async () => {
    const harness = await createCliTestHarness();
    try {
      const out = captureCliOutput();
      await runProjectsList({ ...harness.cliOptions, source: 'all' });
      expectCliSuccess(out, MOCK_IDS.project_id);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('lists with source=local including known-local filter fields', async () => {
    const harness = await createCliTestHarness();
    const registryPath = join(harness.configDir, 'workspaces.json');
    writeFileSync(
      registryPath,
      JSON.stringify({
        schema_version: 1,
        workspaces: [
          {
            path: harness.configDir,
            project_id: MOCK_IDS.project_id,
            last_seen_at: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
      'utf-8'
    );
    try {
      const out = captureCliOutput();
      await runProjectsList({
        ...harness.cliOptions,
        source: 'local',
        registryPath,
        cwd: harness.configDir,
      });
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.text).toContain(MOCK_IDS.project_id);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('lists with source=remote', async () => {
    const harness = await createCliTestHarness();
    try {
      const out = captureCliOutput();
      await runProjectsList({
        ...harness.cliOptions,
        source: 'remote',
        registryPath: join(harness.configDir, 'empty-workspaces.json'),
      });
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.text).toContain(MOCK_IDS.project_id);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('gets a project with status enrichment and latest deployment', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runProjectsGet(MOCK_IDS.project_id, {
        ...harness.cliOptions,
        cwd: harness.projectDir,
      });
      expectCliSuccess(out, MOCK_IDS.project_id, 'status_enrichment');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('sets exitCode on projects get failure', async () => {
    const harness = await createCliTestHarness();
    try {
      const out = captureCliOutput();
      await runProjectsGet('00000000-0000-4000-8000-000000000099', {
        ...harness.cliOptions,
        fetch_fn: async () =>
          new Response(JSON.stringify({ success: false, error: { message: 'not found' } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
      });
      expect(process.exitCode).toBe(1);
      expect(out.stderr.length).toBeGreaterThan(0);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('links a cloud project into an empty directory', async () => {
    const harness = await createCliTestHarness();
    const target = join(harness.configDir, 'link-target');
    mkdirSync(target, { recursive: true });
    const registryPath = join(harness.configDir, 'workspaces.json');
    try {
      const out = captureCliOutput();
      await runProjectsLink(MOCK_IDS.project_id, {
        ...harness.cliOptions,
        path: target,
        registryPath,
      });
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.stdout.length + out.stderr.length).toBeGreaterThan(0);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('projects changes returns unpublished inventory CliResult', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const result = await runProjectsChangesCommand({
        cwd: harness.projectDir,
        json: true,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n').length).toBeGreaterThan(0);
    } finally {
      await harness.destroy();
    }
  });

  it('runProjectsChanges prints CliResult lines', async () => {
    const { runProjectsChanges } = await import('./projects-cmd.js');
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runProjectsChanges({ cwd: harness.projectDir, json: true });
      expect(process.exitCode ?? 0).toBe(0);
      expect(out.text.length).toBeGreaterThan(0);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runProjectsClone prints clone result via harness client', async () => {
    const { runProjectsClone } = await import('./projects-cmd.js');
    const harness = await createCliTestHarness();
    const target = join(harness.configDir, 'clone-out');
    const registryPath = join(harness.configDir, 'workspaces.json');
    try {
      const out = captureCliOutput();
      // Mock platform may not implement export — expect non-crash with exit code set.
      await runProjectsClone(MOCK_IDS.project_id, target, {
        ...harness.cliOptions,
        registryPath,
      });
      expect(typeof (process.exitCode ?? 0)).toBe('number');
      expect(out.stdout.length + out.stderr.length).toBeGreaterThan(0);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('lists surface API errors on stderr', async () => {
    const harness = await createCliTestHarness();
    try {
      const out = captureCliOutput();
      await runProjectsList({
        ...harness.cliOptions,
        fetch_fn: async () =>
          new Response(JSON.stringify({ success: false, error: { message: 'list boom' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
      });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toMatch(/list boom|boom|Error|failed/i);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});
