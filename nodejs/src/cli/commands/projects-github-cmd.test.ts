/**
 * Unit tests for `loxtep projects pull|push` (GitHub sync) — mocked client, no network.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import { MOCK_IDS } from '../__tests__/mock-platform-api.js';
import { runProjectsGithubPull, runProjectsGithubPush } from './projects-github-cmd.js';

function mockClient(overrides: {
  get?: jest.Mock;
  github_pull?: jest.Mock;
  github_push?: jest.Mock;
}): LoxtepClient {
  return {
    workspace: {
      projects: {
        get:
          overrides.get ??
          jest.fn().mockResolvedValue({
            project_id: MOCK_IDS.project_id,
            name: 'Test Project',
            organization_id: MOCK_IDS.organization_id,
            github_repo_url: 'https://github.com/test/org-repo',
            status: 'active',
          }),
        github_pull: overrides.github_pull ?? jest.fn().mockResolvedValue({ success: true }),
        github_push: overrides.github_push ?? jest.fn().mockResolvedValue({ success: true }),
      },
    },
  } as unknown as LoxtepClient;
}

describe('runProjectsGithubPull / runProjectsGithubPush', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'loxtep-gh-sync-'));
    mkdirSync(join(projectDir, '.loxtep'), { recursive: true });
    writeFileSync(
      join(projectDir, '.loxtep', 'project.json'),
      JSON.stringify({
        project_id: MOCK_IDS.project_id,
        organization_id: MOCK_IDS.organization_id,
      }),
      'utf-8'
    );
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('pull succeeds and reports commit metadata', async () => {
    const github_pull = jest.fn().mockResolvedValue({
      success: true,
      commit_sha: 'abc123',
      file_count: 4,
      message: 'ok',
    });
    const client = mockClient({ github_pull });
    const result = await runProjectsGithubPull(client, { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join('\n')).toContain('GitHub pull');
    expect(result.stdout.join('\n')).toContain('abc123');
    expect(github_pull).toHaveBeenCalledWith(MOCK_IDS.project_id, {
      commit_sha: undefined,
    });
  });

  it('pull passes commit_sha option', async () => {
    const github_pull = jest.fn().mockResolvedValue({ success: true, commit_sha: 'deadbeef' });
    const client = mockClient({ github_pull });
    const result = await runProjectsGithubPull(client, {
      cwd: projectDir,
      commitSha: 'deadbeef',
    });
    expect(result.exitCode).toBe(0);
    expect(github_pull).toHaveBeenCalledWith(MOCK_IDS.project_id, { commit_sha: 'deadbeef' });
  });

  it('push succeeds with commit message and branch', async () => {
    const github_push = jest.fn().mockResolvedValue({
      success: true,
      commit_sha: 'feedface',
      commit_url: 'https://github.com/test/org-repo/commit/feedface',
      file_count: 2,
    });
    const client = mockClient({ github_push });
    const result = await runProjectsGithubPush(client, {
      cwd: projectDir,
      commitMessage: 'sync from CLI',
      branch: 'main',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join('\n')).toContain('GitHub push');
    expect(result.stdout.join('\n')).toContain('feedface');
    expect(github_push).toHaveBeenCalledWith(MOCK_IDS.project_id, {
      commit_message: 'sync from CLI',
      branch: 'main',
    });
  });

  it('refuses when project has no GitHub binding', async () => {
    const client = mockClient({
      get: jest.fn().mockResolvedValue({
        project_id: MOCK_IDS.project_id,
        name: 'Unbound',
        organization_id: MOCK_IDS.organization_id,
        status: 'active',
      }),
    });
    const result = await runProjectsGithubPull(client, { cwd: projectDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toContain('no GitHub binding');
  });

  it('errors when no project.json and no --project-id', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'loxtep-gh-empty-'));
    try {
      const client = mockClient({});
      const result = await runProjectsGithubPull(client, { cwd: empty });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toContain('No .loxtep/project.json');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('accepts explicit --project-id without local project.json', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'loxtep-gh-id-'));
    try {
      const github_pull = jest.fn().mockResolvedValue({ success: true, commit_sha: 'zzz' });
      const client = mockClient({ github_pull });
      const result = await runProjectsGithubPull(client, {
        cwd: empty,
        projectId: MOCK_IDS.project_id,
      });
      expect(result.exitCode).toBe(0);
      expect(github_pull).toHaveBeenCalled();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('surfaces API errors from github_pull', async () => {
    const client = mockClient({
      github_pull: jest.fn().mockRejectedValue(new Error('upstream 500')),
    });
    const result = await runProjectsGithubPull(client, { cwd: projectDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toContain('upstream 500');
  });

  it('returns errors array from failed pull payload', async () => {
    const client = mockClient({
      github_pull: jest.fn().mockResolvedValue({
        success: false,
        errors: ['conflict on workflows/foo.json'],
      }),
    });
    const result = await runProjectsGithubPull(client, { cwd: projectDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('conflict on workflows/foo.json');
  });
});
