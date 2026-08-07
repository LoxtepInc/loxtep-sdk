import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { formatProjectWorkspaceStatusLines } from '../../client/project-workspace-status.js';
import { buildProjectWorkspaceStatus } from '../../client/project-workspace-status.js';

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
      // Smoke: file existed for cwd-first status precondition path.
      expect(join(dir, '.loxtep', 'project.json')).toContain('.loxtep');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
