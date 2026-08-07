/**
 * Tests: loxtep projects clone (LOX-1188).
 */

import { mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Project } from '../../client/projects-types.js';
import type { ProjectWorkspaceExportResult } from '../../client/projects.js';
import { loadKnownLocalsRegistry } from '../known-locals-registry.js';
import { PROJECT_DIR_NAME, PROJECT_FILE_NAME } from '../project-context.js';
import {
  materializeExportToDir,
  runClone,
  withGitHubAuth,
} from './clone-cmd.js';

const ORG = '33333333-3333-4333-8333-333333333333';

const UNBOUND: Project = {
  project_id: '11111111-1111-4111-8111-111111111111',
  organization_id: ORG,
  name: 'unbound-demo',
  status: 'active',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const BOUND: Project = {
  ...UNBOUND,
  project_id: '22222222-2222-4222-8222-222222222222',
  name: 'github-demo',
  github_repo_url: 'https://github.com/acme/demo.git',
  github_repo_name: 'acme/demo',
  github_branch: 'main',
};

function makeTempDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function mockClient(opts: {
  get: Project;
  exportResult?: ProjectWorkspaceExportResult;
  exportError?: Error;
}): LoxtepClient {
  return {
    workspace: {
      projects: {
        get: async (id: string) => {
          if (opts.get.project_id !== id) throw new Error(`not found: ${id}`);
          return opts.get;
        },
        list: async () => ({
          items: [opts.get],
          pagination: {
            page: 1,
            page_size: 100,
            total: 1,
            total_pages: 1,
            has_next: false,
            has_prev: false,
          },
        }),
        export_workspace: async () => {
          if (opts.exportError) throw opts.exportError;
          if (!opts.exportResult) throw new Error('no export');
          return opts.exportResult;
        },
      },
    },
  } as unknown as LoxtepClient;
}

describe('withGitHubAuth', () => {
  const prevGh = process.env.GH_TOKEN;
  const prevGithub = process.env.GITHUB_TOKEN;

  afterEach(() => {
    if (prevGh === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = prevGh;
    if (prevGithub === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = prevGithub;
  });

  it('injects GH_TOKEN into https URLs', () => {
    process.env.GH_TOKEN = 'secret-token';
    delete process.env.GITHUB_TOKEN;
    expect(withGitHubAuth('https://github.com/acme/demo.git')).toContain(
      'x-access-token:secret-token@'
    );
  });

  it('leaves url unchanged without token', () => {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    expect(withGitHubAuth('https://github.com/acme/demo.git')).toBe(
      'https://github.com/acme/demo.git'
    );
  });
});

describe('materializeExportToDir', () => {
  it('writes entity_type/entity_id.json files', async () => {
    const dir = makeTempDir('loxtep-materialize');
    try {
      const n = await materializeExportToDir(dir, {
        entities: [
          {
            entity_type: 'workflows',
            entity_id: 'wf-1',
            data: { workflow_id: 'wf-1', name: 'Main' },
          },
          {
            entity_type: 'data-products',
            entity_id: 'dp-1',
            data: { data_product_id: 'dp-1', name: 'Events' },
          },
        ],
      });
      expect(n).toBe(2);
      const wf = JSON.parse(readFileSync(join(dir, 'workflows', 'wf-1.json'), 'utf-8'));
      expect(wf.name).toBe('Main');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runClone', () => {
  let registryDir: string;

  beforeEach(() => {
    registryDir = makeTempDir('loxtep-clone-reg');
  });

  afterEach(() => {
    rmSync(registryDir, { recursive: true, force: true });
  });

  it('clones unbound via export + registers known local', async () => {
    const parent = makeTempDir('loxtep-clone-parent');
    const target = join(parent, 'unbound-demo');
    const client = mockClient({
      get: UNBOUND,
      exportResult: {
        project_id: UNBOUND.project_id,
        organization_id: ORG,
        uses_streaming: false,
        total_size_bytes: 12,
        export_data: {
          entities: [
            {
              entity_type: 'domains',
              entity_id: 'd1',
              data: { domain_id: 'd1', name: 'Core' },
            },
          ],
        },
      },
    });

    try {
      const result = await runClone(client, {
        projectRef: UNBOUND.project_id,
        dir: target,
        registryPath: join(registryDir, 'workspaces.json'),
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(target, PROJECT_DIR_NAME, PROJECT_FILE_NAME))).toBe(true);
      expect(existsSync(join(target, 'domains', 'd1.json'))).toBe(true);
      const cfg = JSON.parse(
        readFileSync(join(target, PROJECT_DIR_NAME, PROJECT_FILE_NAME), 'utf-8')
      );
      expect(cfg.project_id).toBe(UNBOUND.project_id);
      const reg = loadKnownLocalsRegistry(join(registryDir, 'workspaces.json'));
      expect(reg.workspaces.some(w => w.project_id === UNBOUND.project_id)).toBe(true);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('clones GitHub-bound via gitClone hook + binds workspace', async () => {
    const parent = makeTempDir('loxtep-clone-gh-parent');
    const target = join(parent, 'github-demo');
    const client = mockClient({ get: BOUND });

    try {
      const result = await runClone(client, {
        projectRef: BOUND.project_id,
        dir: target,
        registryPath: join(registryDir, 'workspaces.json'),
        gitClone: async ({ targetDir }) => {
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(join(targetDir, 'README.md'), 'demo\n');
        },
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(target, PROJECT_DIR_NAME, PROJECT_FILE_NAME))).toBe(true);
      const cfg = JSON.parse(
        readFileSync(join(target, PROJECT_DIR_NAME, PROJECT_FILE_NAME), 'utf-8')
      );
      expect(cfg.repository?.url).toBe(BOUND.github_repo_url);
      const reg = loadKnownLocalsRegistry(join(registryDir, 'workspaces.json'));
      expect(reg.workspaces.some(w => w.path === target)).toBe(true);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('refuses overlapping existing target for git clone', async () => {
    const parent = makeTempDir('loxtep-clone-exists');
    const target = join(parent, 'github-demo');
    mkdirSync(target, { recursive: true });
    const client = mockClient({ get: BOUND });
    try {
      const result = await runClone(client, {
        projectRef: BOUND.project_id,
        dir: target,
        registryPath: join(registryDir, 'workspaces.json'),
        gitClone: async () => {
          throw new Error('should not run');
        },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join(' ')).toMatch(/already exists/);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
