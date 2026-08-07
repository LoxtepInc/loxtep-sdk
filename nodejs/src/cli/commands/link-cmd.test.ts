/**
 * Tests: loxtep projects link + known-locals registry round-trip (LOX-1186).
 */

import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Project } from '../../client/projects-types.js';
import { loadKnownLocalsRegistry } from '../known-locals-registry.js';
import {
  buildLinkedProjectConfig,
  resolveCloudProject,
  runLink,
} from './link-cmd.js';

const PROJECT_A: Project = {
  project_id: '11111111-1111-4111-8111-111111111111',
  organization_id: '33333333-3333-4333-8333-333333333333',
  name: 'shopify-ingest',
  status: 'active',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const PROJECT_B: Project = {
  ...PROJECT_A,
  project_id: '22222222-2222-4222-8222-222222222222',
  name: 'other-proj',
  github_repo_url: 'https://github.com/acme/other',
  github_repo_name: 'acme/other',
};

function makeTempDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function mockClient(opts: {
  get?: Project | Error;
  list?: Project[];
}): LoxtepClient {
  return {
    workspace: {
      projects: {
        get: async (id: string) => {
          if (opts.get instanceof Error) throw opts.get;
          if (opts.get) {
            if (opts.get.project_id !== id) {
              throw new Error(`not found: ${id}`);
            }
            return opts.get;
          }
          throw new Error(`not found: ${id}`);
        },
        list: async () => ({
          items: opts.list ?? [],
          pagination: {
            page: 1,
            page_size: 100,
            total: (opts.list ?? []).length,
            total_pages: 1,
            has_next: false,
            has_prev: false,
          },
        }),
      },
    },
  } as unknown as LoxtepClient;
}

describe('buildLinkedProjectConfig', () => {
  it('writes project_id + org without requiring GitHub', () => {
    const cfg = buildLinkedProjectConfig(PROJECT_A);
    expect(cfg.project_id).toBe(PROJECT_A.project_id);
    expect(cfg.organization_id).toBe(PROJECT_A.organization_id);
    expect(cfg.instance_id).toBeUndefined();
    expect(cfg.api_url).toBeUndefined();
    expect(cfg.repository).toBeUndefined();
  });

  it('preserves attach fields from an existing local config', () => {
    const cfg = buildLinkedProjectConfig(PROJECT_A, {
      project_id: 'proj_local_old',
      instance_id: 'inst-1',
      api_url: 'https://apidev.loxtep.io',
      region: 'us-east-1',
    });
    expect(cfg.project_id).toBe(PROJECT_A.project_id);
    expect(cfg.instance_id).toBe('inst-1');
    expect(cfg.api_url).toBe('https://apidev.loxtep.io');
  });
});

describe('resolveCloudProject', () => {
  it('resolves by UUID via get', async () => {
    const client = mockClient({ get: PROJECT_A });
    const p = await resolveCloudProject(client, PROJECT_A.project_id);
    expect(p.name).toBe('shopify-ingest');
  });

  it('resolves by exact name via list', async () => {
    const client = mockClient({ list: [PROJECT_A, PROJECT_B] });
    const p = await resolveCloudProject(client, 'Shopify-Ingest');
    expect(p.project_id).toBe(PROJECT_A.project_id);
  });

  it('errors when name is ambiguous', async () => {
    const client = mockClient({
      list: [PROJECT_A, { ...PROJECT_A, project_id: '99999999-9999-4999-8999-999999999999' }],
    });
    await expect(resolveCloudProject(client, 'shopify-ingest')).rejects.toThrow(/Multiple projects/);
  });
});

describe('runLink', () => {
  let cwd: string;
  let registryDir: string;
  let registryPath: string;

  beforeEach(() => {
    cwd = makeTempDir('loxtep-link-cwd');
    registryDir = makeTempDir('loxtep-link-reg');
    registryPath = join(registryDir, 'workspaces.json');
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(registryDir, { recursive: true, force: true });
  });

  it('links an unbound cloud project into an empty dir and upserts registry', async () => {
    const client = mockClient({ get: PROJECT_A });
    const result = await runLink(client, {
      projectRef: PROJECT_A.project_id,
      path: cwd,
      registryPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.some(l => l.includes('Linked cloud project'))).toBe(true);
    expect(result.stdout.some(l => l.includes('loxtep attach'))).toBe(true);
    expect(result.stdout.some(l => /no GitHub binding/i.test(l))).toBe(true);

    const projectFile = join(cwd, '.loxtep', 'project.json');
    expect(existsSync(projectFile)).toBe(true);
    const written = JSON.parse(readFileSync(projectFile, 'utf-8'));
    expect(written.project_id).toBe(PROJECT_A.project_id);
    expect(written.organization_id).toBe(PROJECT_A.organization_id);
    expect(written.instance_id).toBeUndefined();

    const reg = loadKnownLocalsRegistry(registryPath);
    expect(reg.workspaces).toHaveLength(1);
    expect(reg.workspaces[0].project_id).toBe(PROJECT_A.project_id);
    expect(reg.workspaces[0].path).toBe(cwd);
  });

  it('is idempotent when re-linking the same project_id', async () => {
    const client = mockClient({ get: PROJECT_A });
    const first = await runLink(client, {
      projectRef: PROJECT_A.project_id,
      path: cwd,
      registryPath,
    });
    const second = await runLink(client, {
      projectRef: PROJECT_A.project_id,
      path: cwd,
      registryPath,
    });
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(loadKnownLocalsRegistry(registryPath).workspaces).toHaveLength(1);
  });

  it('refuses to overwrite a different cloud project binding', async () => {
    const clientA = mockClient({ get: PROJECT_A });
    await runLink(clientA, {
      projectRef: PROJECT_A.project_id,
      path: cwd,
      registryPath,
    });

    const clientB = mockClient({ get: PROJECT_B });
    const result = await runLink(clientB, {
      projectRef: PROJECT_B.project_id,
      path: cwd,
      registryPath,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toMatch(/already bound/);
  });

  it('fails cleanly when cloud project is missing', async () => {
    const client = mockClient({ get: new Error('404') });
    const result = await runLink(client, {
      projectRef: PROJECT_A.project_id,
      path: cwd,
      registryPath,
    });
    expect(result.exitCode).toBe(1);
    expect(existsSync(join(cwd, '.loxtep', 'project.json'))).toBe(false);
  });
});
