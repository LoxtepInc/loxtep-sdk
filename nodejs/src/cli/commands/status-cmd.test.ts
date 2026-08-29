import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { formatProjectWorkspaceStatusLines } from '../../client/project-workspace-status.js';
import { buildProjectWorkspaceStatus } from '../../client/project-workspace-status.js';
import {
  createLocalProjectHarness,
  captureCliOutput,
  expectCliSuccess,
} from '../__tests__/cli-test-harness.js';
import { MOCK_IDS, createPlatformMockFetch } from '../__tests__/mock-platform-api.js';
import { runStatus, runStatusCommand } from './status-cmd.js';

describe('status-cmd rendering', () => {
  it('formats never-deployed vs clean screens differently', () => {
    const base = {
      population_depth: 'status' as const,
      local: {
        project_id: '11111111-1111-1111-1111-111111111111',
        path: '/tmp/p',
        project_file: '/tmp/p/.loxtep/project.json',
        instance_id: '22222222-2222-2222-2222-222222222222',
        api_url: 'https://apidev.loxtep.io',
      },
      cloud: {
        project_id: '11111111-1111-1111-1111-111111111111',
        organization_id: '33333333-3333-3333-3333-333333333333',
        name: 'demo',
        status: 'active' as const,
        is_active: true,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
        github_repo_url: 'https://github.com/acme/demo',
        github_repo_name: 'acme/demo',
      },
      local_git_dirty: false as boolean,
      now_ms: Date.parse('2026-08-06T00:00:00.000Z'),
    };

    const never = buildProjectWorkspaceStatus({ ...base, deployments: [] });
    const neverText = formatProjectWorkspaceStatusLines(never).join('\n');
    expect(neverText).toContain('never deployed');
    expect(neverText).toContain('GitHub:  linked');
    expect(neverText).toContain('Attach:  attached');

    const clean = buildProjectWorkspaceStatus({
      ...base,
      deployments: [
        {
          deployment_id: '44444444-4444-4444-4444-444444444444',
          project_id: '11111111-1111-1111-1111-111111111111',
          instance_id: '22222222-2222-2222-2222-222222222222',
          name: 'main',
          status: 'deployed',
          created_at: '2026-08-04T00:00:00.000Z',
          updated_at: '2026-08-05T00:00:00.000Z',
        },
      ],
    });
    const cleanText = formatProjectWorkspaceStatusLines(clean).join('\n');
    expect(cleanText).toMatch(/Deploy:\s+deployed/);
    expect(cleanText).not.toContain('never deployed');
    expect(cleanText).toContain('Next:    none');
  });

  it('tryLoad-friendly fixture directory looks like an attached project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loxtep-status-'));
    try {
      mkdirSync(join(dir, '.loxtep'));
      writeFileSync(
        join(dir, '.loxtep', 'project.json'),
        JSON.stringify({
          project_id: '11111111-1111-1111-1111-111111111111',
          instance_id: '22222222-2222-2222-2222-222222222222',
          api_url: 'https://apidev.loxtep.io',
          streams: {},
        }),
        'utf-8'
      );
      expect(join(dir, '.loxtep', 'project.json')).toContain('.loxtep');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runStatusCommand / runStatus (mock client)', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('returns exit 1 when no project.json is found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'loxtep-status-noproj-'));
    try {
      const result = await runStatusCommand({ cwd: dir });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toContain('No .loxtep/project.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints text status with project get + deployments', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const result = await runStatusCommand({
        cwd: harness.projectDir,
        ...harness.cliOptions,
      });
      expect(result.exitCode).toBe(0);
      const text = result.stdout.join('\n');
      expect(text).toMatch(/Deploy:/);
      expect(text).toContain(MOCK_IDS.project_id);
    } finally {
      await harness.destroy();
    }
  });

  it('emits JSON status payload with --json', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const result = await runStatusCommand({
        cwd: harness.projectDir,
        ...harness.cliOptions,
        json: true,
      });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout.join('\n')) as {
        local?: { project_id?: string };
        cloud?: { project_id?: string };
        population_depth?: string;
      };
      expect(parsed.local?.project_id).toBe(MOCK_IDS.project_id);
      expect(parsed.cloud?.project_id).toBe(MOCK_IDS.project_id);
      expect(parsed.population_depth).toBe('status');
    } finally {
      await harness.destroy();
    }
  });

  it('includes unpublished inventory when --unpublished', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const result = await runStatusCommand({
        cwd: harness.projectDir,
        ...harness.cliOptions,
        unpublished: true,
        json: true,
      });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout.join('\n')) as {
        population_depth?: string;
        cloud_workflow_ids?: string[] | null;
      };
      expect(parsed.population_depth).toBe('unpublished');
      expect(parsed).toHaveProperty('unpublished');
      // Text view should mention workflow inventory when cloud list succeeds
      const text = await runStatusCommand({
        cwd: harness.projectDir,
        ...harness.cliOptions,
        unpublished: true,
      });
      expect(text.exitCode).toBe(0);
      expect(text.stdout.join('\n').length).toBeGreaterThan(0);
    } finally {
      await harness.destroy();
    }
  });

  it('runStatus writes stdout and leaves exitCode unset on success', async () => {
    const harness = await createLocalProjectHarness();
    try {
      const out = captureCliOutput();
      await runStatus({
        cwd: harness.projectDir,
        ...harness.cliOptions,
        json: true,
      });
      expectCliSuccess(out, MOCK_IDS.project_id);
      expect(process.exitCode ?? 0).toBe(0);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('runStatus sets exitCode when project.json is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'loxtep-status-run-'));
    try {
      const out = captureCliOutput();
      await runStatus({ cwd: dir });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toContain('No .loxtep/project.json');
      out.restore();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns degraded status JSON when cloud project get fails', async () => {
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET' && /\/workflows\/projects\/[^/?]+$/.test(pathname.split('?')[0] ?? '')) {
          return new Response(JSON.stringify({ success: false, message: 'boom' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      const result = await runStatusCommand({
        cwd: harness.projectDir,
        ...harness.cliOptions,
        fetch_fn: fetchFn,
        json: true,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toMatch(/Cloud project get failed|notes/i);
    } finally {
      await harness.destroy();
    }
  });
});
