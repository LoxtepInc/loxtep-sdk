/**
 * Unit tests for `loxtep attach [--instance <id>]`.
 *
 * Validates:
 * - R1.3: Attach links via the same connection mechanism as Platform_UI
 * - R1.9: On failure, exit non-zero, print reason, leave file unchanged
 * - R17.2: Write `repository` block when project is GitHub-bound
 * - R17.3: Omit `repository` block when project is unbound
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAttach, projectToRepository } from './attach-cmd.js';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Instance } from '../../client/instances-types.js';
import type { Project } from '../../client/projects-types.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `loxtep-attach-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function scaffoldProject(dir: string, config: Record<string, unknown>): string {
  const loxtepDir = join(dir, '.loxtep');
  mkdirSync(loxtepDir, { recursive: true });
  const filePath = join(loxtepDir, 'project.json');
  writeFileSync(filePath, JSON.stringify(config, null, 2));
  return filePath;
}

function makeInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    instance_id: 'inst_abc123',
    organization_id: 'org_xyz',
    name: 'sandbox',
    api_url: 'https://api.loxtep.io',
    region: 'us-east-1',
    stack_id: 'stack-1',
    status: 'active',
    connection_details: {},
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    project_id: 'proj_test1',
    organization_id: 'org_xyz',
    name: 'Test Project',
    status: 'active',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockClient(opts: {
  instances?: Instance[];
  getInstance?: Instance;
  getInstanceError?: Error;
  project?: Project;
  projectError?: Error;
}): LoxtepClient {
  return {
    instances: {
      list: async () => ({ items: opts.instances ?? [makeInstance()], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false } }),
      get: async (_id: string) => {
        if (opts.getInstanceError) throw opts.getInstanceError;
        return opts.getInstance ?? makeInstance();
      },
      get_stream_config: async () => ({} as any),
    },
    projects: {
      get: async (_id: string) => {
        if (opts.projectError) throw opts.projectError;
        return opts.project ?? makeProject();
      },
      list: async () => [],
      create: async () => makeProject(),
      update: async () => makeProject(),
      delete: async () => ({ project_id: 'proj_test1', deleted: true }),
      apply_template: async () => ({} as any),
    },
  } as unknown as LoxtepClient;
}

describe('loxtep attach', () => {
  let tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  it('exits non-zero when no .loxtep/project.json exists (R1.7 precondition)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const client = mockClient({});
    const result = await runAttach(client, { cwd: dir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('loxtep init');
  });

  it('attaches successfully with a specific --instance id, writing instance_id and api_url (R1.3)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const filePath = scaffoldProject(dir, { project_id: 'proj_test1' });

    const instance = makeInstance({ instance_id: 'inst_specific', api_url: 'https://specific.api.io' });
    const client = mockClient({ getInstance: instance, project: makeProject() });

    const result = await runAttach(client, { cwd: dir, instanceId: 'inst_specific' });
    expect(result.exitCode).toBe(0);

    const written = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(written.instance_id).toBe('inst_specific');
    expect(written.api_url).toBe('https://specific.api.io');
  });

  it('auto-selects the sole instance when --instance is omitted', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    scaffoldProject(dir, { project_id: 'proj_test1' });

    const instance = makeInstance({ instance_id: 'inst_only' });
    const client = mockClient({ instances: [instance], project: makeProject() });

    const result = await runAttach(client, { cwd: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join(' ')).toContain('inst_only');
  });

  it('fails when multiple instances exist and no --instance is specified', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    scaffoldProject(dir, { project_id: 'proj_test1' });

    const client = mockClient({
      instances: [makeInstance({ instance_id: 'inst_1' }), makeInstance({ instance_id: 'inst_2' })],
    });

    const result = await runAttach(client, { cwd: dir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('--instance');
  });

  it('fails when no instances exist', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    scaffoldProject(dir, { project_id: 'proj_test1' });

    const client = mockClient({ instances: [] });

    const result = await runAttach(client, { cwd: dir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('No instances');
  });

  it('fails when instance get returns an error, leaving file unchanged (R1.9)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const filePath = scaffoldProject(dir, { project_id: 'proj_test1' });
    const originalContent = readFileSync(filePath, 'utf-8');

    const client = mockClient({
      getInstanceError: new Error('Instance not found'),
    });

    const result = await runAttach(client, { cwd: dir, instanceId: 'inst_bad' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Instance not found');

    // File should be byte-unchanged (R1.9)
    const afterContent = readFileSync(filePath, 'utf-8');
    expect(afterContent).toBe(originalContent);
  });

  it('fails when project.get returns an error, leaving file unchanged (R1.9)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const filePath = scaffoldProject(dir, { project_id: 'proj_test1' });
    const originalContent = readFileSync(filePath, 'utf-8');

    const client = mockClient({
      projectError: new Error('Unauthorized'),
    });

    const result = await runAttach(client, { cwd: dir, instanceId: 'inst_abc123' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Unauthorized');

    const afterContent = readFileSync(filePath, 'utf-8');
    expect(afterContent).toBe(originalContent);
  });

  it('writes a repository block when the project is GitHub-bound (R17.2)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const filePath = scaffoldProject(dir, { project_id: 'proj_test1' });

    const boundProject = makeProject({
      github_repo_url: 'https://github.com/acme/data-mesh',
      github_repo_name: 'acme/data-mesh',
      github_repo_path: 'packages/service',
      github_branch: 'develop',
    });
    const client = mockClient({ project: boundProject });

    const result = await runAttach(client, { cwd: dir, instanceId: 'inst_abc123' });
    expect(result.exitCode).toBe(0);

    const written = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(written.repository).toBeDefined();
    expect(written.repository.url).toBe('https://github.com/acme/data-mesh');
    expect(written.repository.name).toBe('acme/data-mesh');
    expect(written.repository.subpath).toBe('packages/service');
    expect(written.repository.branch).toBe('develop');
  });

  it('omits the repository block when the project is unbound (R17.3)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const filePath = scaffoldProject(dir, { project_id: 'proj_test1' });

    const unboundProject = makeProject({
      github_repo_url: undefined,
      github_repo_name: undefined,
    });
    const client = mockClient({ project: unboundProject });

    const result = await runAttach(client, { cwd: dir, instanceId: 'inst_abc123' });
    expect(result.exitCode).toBe(0);

    const written = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(written.repository).toBeUndefined();
  });

  it('defaults branch to "main" when github_branch is absent', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const filePath = scaffoldProject(dir, { project_id: 'proj_test1' });

    const project = makeProject({
      github_repo_url: 'https://github.com/acme/repo',
      github_repo_name: 'acme/repo',
      github_branch: undefined,
    });
    const client = mockClient({ project });

    const result = await runAttach(client, { cwd: dir, instanceId: 'inst_abc123' });
    expect(result.exitCode).toBe(0);

    const written = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(written.repository.branch).toBe('main');
  });

  it('does not include subpath when github_repo_path is empty', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const filePath = scaffoldProject(dir, { project_id: 'proj_test1' });

    const project = makeProject({
      github_repo_url: 'https://github.com/acme/repo',
      github_repo_name: 'acme/repo',
      github_repo_path: '',
    });
    const client = mockClient({ project });

    const result = await runAttach(client, { cwd: dir, instanceId: 'inst_abc123' });
    expect(result.exitCode).toBe(0);

    const written = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(written.repository.subpath).toBeUndefined();
  });
});

describe('projectToRepository', () => {
  it('returns undefined for unbound projects', () => {
    const project = makeProject();
    expect(projectToRepository(project)).toBeUndefined();
  });

  it('returns repository for fully-bound projects', () => {
    const project = makeProject({
      github_repo_url: 'https://github.com/org/repo',
      github_repo_name: 'org/repo',
      github_repo_path: 'sub/path',
      github_branch: 'feature',
    });
    const repo = projectToRepository(project);
    expect(repo).toEqual({
      url: 'https://github.com/org/repo',
      name: 'org/repo',
      subpath: 'sub/path',
      branch: 'feature',
    });
  });

  it('returns undefined when only url is set but name is missing', () => {
    const project = makeProject({
      github_repo_url: 'https://github.com/org/repo',
      github_repo_name: undefined,
    });
    expect(projectToRepository(project)).toBeUndefined();
  });
});
