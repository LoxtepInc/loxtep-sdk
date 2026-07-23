/**
 * Unit tests for `loxtep init` command.
 *
 * Covers:
 * - Bare scaffold (R1.1)
 * - Template scaffold with AGENTS.md + skill (R16.1, R16.2)
 * - Repo flag mapping (R17.4, R17.5, R17.6)
 * - Doc link printing (R11.7)
 * - Generate auto-run and failure (R16.3, R16.4, R16.5)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runInitCommand, repoFlagsToGithubAction } from './init-cmd.js';
import type { CliResult } from '../project-context.js';
import { LOCAL_PROJECT_ID_PREFIX } from '../project-context.js';

function mockAuthedClient(overrides: {
  create?: jest.Mock;
  get?: jest.Mock;
} = {}) {
  return {
    workspace: {
      projects: {
        create:
          overrides.create ??
          jest.fn().mockResolvedValue({
            project_id: 'proj_test_123',
            organization_id: 'org_test_456',
          }),
        get:
          overrides.get ??
          jest.fn().mockResolvedValue({
            project_id: 'proj_test_123',
            organization_id: 'org_test_456',
          }),
      },
    },
    connect: {
      templates: { list: jest.fn().mockResolvedValue({ items: [] }), get: jest.fn() },
    },
  } as any;
}

describe('repoFlagsToGithubAction (pure mapping)', () => {
  it('maps --create-repo to create_new', () => {
    const result = repoFlagsToGithubAction({ createRepo: 'my-repo' });
    expect(result).toEqual({ ok: true, action: 'create_new', repoName: 'my-repo' });
  });

  it('maps --create-repo (boolean) to create_new with no repo name', () => {
    const result = repoFlagsToGithubAction({ createRepo: true });
    expect(result).toEqual({ ok: true, action: 'create_new', repoName: undefined });
  });

  it('maps --from-repo to import_existing', () => {
    const result = repoFlagsToGithubAction({ fromRepo: 'https://github.com/org/repo' });
    expect(result).toEqual({
      ok: true,
      action: 'import_existing',
      importUrl: 'https://github.com/org/repo',
    });
  });

  it('maps neither flag to none', () => {
    const result = repoFlagsToGithubAction({});
    expect(result).toEqual({ ok: true, action: 'none' });
  });

  it('rejects both flags', () => {
    const result = repoFlagsToGithubAction({
      createRepo: 'my-repo',
      fromRepo: 'https://github.com/org/repo',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Cannot specify both');
    }
  });
});

describe('runInitCommand', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'loxtep-init-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds bare project structure when authenticated (R1.1)', async () => {
    const result = await runInitCommand({ cwd: tmpDir, client: mockAuthedClient() });

    expect(result.exitCode).toBe(0);

    // Standard directories created
    expect(existsSync(join(tmpDir, 'domains'))).toBe(true);
    expect(existsSync(join(tmpDir, 'connectors'))).toBe(true);
    expect(existsSync(join(tmpDir, 'workflows'))).toBe(true);
    expect(existsSync(join(tmpDir, 'data-products'))).toBe(true);

    // .loxtep/project.json created with platform id
    const projectJson = JSON.parse(
      readFileSync(join(tmpDir, '.loxtep', 'project.json'), 'utf-8')
    );
    expect(projectJson.project_id).toBe('proj_test_123');
    expect(projectJson.organization_id).toBe('org_test_456');
  });

  it('fails without auth instead of writing proj_local_* ids', async () => {
    const result = await runInitCommand({ cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toContain('Authentication required');
    expect(existsSync(join(tmpDir, '.loxtep', 'project.json'))).toBe(false);
    expect(existsSync(join(tmpDir, 'workflows'))).toBe(true);
  });

  it('binds existing project with --project-id', async () => {
    const get = jest.fn().mockResolvedValue({
      project_id: 'ed125001-d343-483a-b045-ef2bcaeffb2c',
      organization_id: '1e6b719f-c8a2-47f5-93b3-58530e6711d6',
    });
    const create = jest.fn();
    const result = await runInitCommand({
      cwd: tmpDir,
      client: mockAuthedClient({ create, get }),
      projectId: 'ed125001-d343-483a-b045-ef2bcaeffb2c',
    });

    expect(result.exitCode).toBe(0);
    expect(create).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('ed125001-d343-483a-b045-ef2bcaeffb2c');
    const projectJson = JSON.parse(
      readFileSync(join(tmpDir, '.loxtep', 'project.json'), 'utf-8')
    );
    expect(projectJson.project_id).toBe('ed125001-d343-483a-b045-ef2bcaeffb2c');
  });

  it('upgrades stale proj_local_* id when re-init after login', async () => {
    const loxtepDir = join(tmpDir, '.loxtep');
    await mkdir(loxtepDir, { recursive: true });
    await writeFile(
      join(loxtepDir, 'project.json'),
      JSON.stringify({ project_id: `${LOCAL_PROJECT_ID_PREFIX}abc123` }, null, 2),
      'utf-8'
    );

    const create = jest.fn().mockResolvedValue({
      project_id: 'proj_upgraded_999',
      organization_id: 'org_upgraded_888',
    });

    const result = await runInitCommand({
      cwd: tmpDir,
      client: mockAuthedClient({ create }),
    });

    expect(result.exitCode).toBe(0);
    expect(create).toHaveBeenCalled();
    expect(result.stdout.join('\n')).toContain('replaced local-only');
    const projectJson = JSON.parse(readFileSync(join(loxtepDir, 'project.json'), 'utf-8'));
    expect(projectJson.project_id).toBe('proj_upgraded_999');
  });

  it('fails when platform project create fails (no silent local fallback)', async () => {
    const create = jest.fn().mockRejectedValue(new Error('403 Forbidden'));
    const result = await runInitCommand({
      cwd: tmpDir,
      client: mockAuthedClient({ create }),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toContain('Could not create project');
    expect(existsSync(join(tmpDir, '.loxtep', 'project.json'))).toBe(false);
  });

  it('prints Getting Started and Quick Reference links (R11.7)', async () => {
    const result = await runInitCommand({ cwd: tmpDir, client: mockAuthedClient() });

    expect(result.exitCode).toBe(0);
    const allOutput = result.stdout.join('\n');
    expect(allOutput).toContain('https://docs.loxtep.io/getting-started');
    expect(allOutput).toContain('https://docs.loxtep.io/quick-reference');
  });

  it('scaffolds template with AGENTS.md and skill YAML (R16.1, R16.2)', async () => {
    const result = await runInitCommand({
      cwd: tmpDir,
      templateSlug: 'commerce-mesh',
      client: mockAuthedClient(),
    });

    expect(result.exitCode).toBe(0);

    // AGENTS.md created
    expect(existsSync(join(tmpDir, 'AGENTS.md'))).toBe(true);
    const agentsMd = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('commerce-mesh');

    // Default skill YAML created
    const skillPath = join(tmpDir, '.loxtep', 'skills', 'commerce-mesh.yaml');
    expect(existsSync(skillPath)).toBe(true);
    const skillContent = readFileSync(skillPath, 'utf-8');
    expect(skillContent).toContain('name: commerce-mesh');

    // project.json records template slug
    const projectJson = JSON.parse(
      readFileSync(join(tmpDir, '.loxtep', 'project.json'), 'utf-8')
    );
    expect(projectJson.template_slug).toBe('commerce-mesh');
  });

  it('prints login guidance when init succeeds without client on existing project', async () => {
    const loxtepDir = join(tmpDir, '.loxtep');
    await mkdir(loxtepDir, { recursive: true });
    await writeFile(
      join(loxtepDir, 'project.json'),
      JSON.stringify({ project_id: 'proj_existing_001' }, null, 2),
      'utf-8'
    );

    const result = await runInitCommand({ cwd: tmpDir, client: null });

    expect(result.exitCode).toBe(0);
    const allOutput = result.stdout.join('\n');
    expect(allOutput).toContain('loxtep login');
    expect(allOutput).toContain('loxtep attach');
    expect(allOutput).toContain('loxtep generate');
  });

  it('rejects both --create-repo and --from-repo (R17.6)', async () => {
    const result = await runInitCommand({
      cwd: tmpDir,
      createRepo: 'my-repo',
      fromRepo: 'https://github.com/org/repo',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toContain('Cannot specify both');
  });

  it('fails the whole init when generate fails (R16.4)', async () => {
    const mockClient = mockAuthedClient({
      create: jest.fn().mockResolvedValue({
        project_id: 'proj_test_123',
        organization_id: 'org_test_456',
      }),
    });

    // A generate function that fails
    const failingGenerate = jest.fn().mockResolvedValue({
      exitCode: 1,
      stdout: [],
      stderr: ['Generate failed: could not fetch workspace context'],
    } as CliResult);

    const result = await runInitCommand({
      cwd: tmpDir,
      client: mockClient,
      instanceId: 'inst_test_789',
      apiUrl: 'https://api.loxtep.io',
      runGenerate: failingGenerate,
    });

    // R16.4: if generate fails, the whole init fails
    expect(result.exitCode).not.toBe(0);
    expect(failingGenerate).toHaveBeenCalledWith(tmpDir, mockClient);
    expect(result.stderr.join('\n')).toContain('generate');
  });

  it('auto-runs generate when authed and attached (R16.3)', async () => {
    const mockClient = mockAuthedClient({
      create: jest.fn().mockResolvedValue({
        project_id: 'proj_gen_001',
        organization_id: 'org_gen_001',
      }),
    });

    // A generate function that succeeds
    const successGenerate = jest.fn().mockResolvedValue({
      exitCode: 0,
      stdout: ['Generated: 3 data products, 2 connectors, 1 domain, 4 queues'],
      stderr: [],
    } as CliResult);

    const result = await runInitCommand({
      cwd: tmpDir,
      client: mockClient,
      instanceId: 'inst_attached_001',
      apiUrl: 'https://api.loxtep.io',
      runGenerate: successGenerate,
    });

    // R16.3: init succeeds and generate was called
    expect(result.exitCode).toBe(0);
    expect(successGenerate).toHaveBeenCalledWith(tmpDir, mockClient);
    // Generate output appears in stdout
    expect(result.stdout.join('\n')).toContain('Generated');
  });

  it('does not run generate when not attached (R16.5 path)', async () => {
    const mockClient = mockAuthedClient({
      create: jest.fn().mockResolvedValue({
        project_id: 'proj_no_attach',
        organization_id: 'org_no_attach',
      }),
    });

    const generateSpy = jest.fn();

    const result = await runInitCommand({
      cwd: tmpDir,
      client: mockClient,
      // No instanceId or apiUrl — not attached
      runGenerate: generateSpy,
    });

    // Generate should NOT be called
    expect(result.exitCode).toBe(0);
    expect(generateSpy).not.toHaveBeenCalled();
    // Should print attach guidance instead
    const allOutput = result.stdout.join('\n');
    expect(allOutput).toContain('loxtep attach');
    expect(allOutput).toContain('loxtep generate');
  });

  it('writes instance_id and api_url to project.json when attached (R16.3)', async () => {
    const mockClient = mockAuthedClient({
      create: jest.fn().mockResolvedValue({
        project_id: 'proj_cfg_001',
        organization_id: 'org_cfg_001',
      }),
    });

    const successGenerate = jest.fn().mockResolvedValue({
      exitCode: 0,
      stdout: ['Generated: 1 data product'],
      stderr: [],
    } as CliResult);

    await runInitCommand({
      cwd: tmpDir,
      client: mockClient,
      instanceId: 'inst_write_001',
      apiUrl: 'https://api.loxtep.io',
      runGenerate: successGenerate,
    });

    // Verify project.json includes instance_id and api_url
    const projectJson = JSON.parse(
      readFileSync(join(tmpDir, '.loxtep', 'project.json'), 'utf-8')
    );
    expect(projectJson.instance_id).toBe('inst_write_001');
    expect(projectJson.api_url).toBe('https://api.loxtep.io');
  });
});
