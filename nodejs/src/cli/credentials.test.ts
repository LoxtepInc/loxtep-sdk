import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveCredentialsPath,
  resolveCredentialsWriteTarget,
  getLocalCredentialsPath,
  getCredentialsPath,
} from './credentials.js';
import { getProjectFilePath } from './project-context.js';

describe('credentials path resolution', () => {
  let root: string;

  beforeEach(async () => {
    root = join(tmpdir(), `loxtep-creds-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(root)) await rm(root, { recursive: true, force: true });
  });

  it('resolveCredentialsWriteTarget defaults to ./.loxtep/credentials.json under cwd', () => {
    const cwd = join(root, 'my-repo');
    const target = resolveCredentialsWriteTarget(cwd);
    expect(target.scope).toBe('local');
    expect(target.path).toBe(getLocalCredentialsPath(cwd));
    expect(target.path).toBe(join(cwd, '.loxtep', 'credentials.json'));
  });

  it('resolveCredentialsWriteTarget uses ~/.loxtep when --global', () => {
    const target = resolveCredentialsWriteTarget(root, 'global');
    expect(target.scope).toBe('global');
    expect(target.path).toBe(getCredentialsPath());
  });

  it('resolveCredentialsPath prefers local credentials.json walking up from cwd', async () => {
    const projectRoot = join(root, 'nested', 'pkg');
    await mkdir(join(projectRoot, '.loxtep'), { recursive: true });
    const localPath = getLocalCredentialsPath(projectRoot);
    await writeFile(localPath, JSON.stringify({ access_token: 'tok' }), 'utf-8');

    const fromSubdir = join(projectRoot, 'src');
    await mkdir(fromSubdir, { recursive: true });

    const resolved = resolveCredentialsPath(fromSubdir);
    expect(resolved.scope).toBe('local');
    expect(resolved.path).toBe(localPath);
  });

  it('resolveCredentialsPath falls back to global when no local credentials exist', () => {
    const resolved = resolveCredentialsPath(root);
    expect(resolved.scope).toBe('global');
    expect(resolved.path).toBe(getCredentialsPath());
  });

  it('resolveCredentialsWriteTarget does not require project.json', async () => {
    const cwd = join(root, 'no-init-yet');
    await mkdir(cwd, { recursive: true });
    expect(existsSync(getProjectFilePath(cwd))).toBe(false);

    const target = resolveCredentialsWriteTarget(cwd);
    expect(target.path).toBe(getLocalCredentialsPath(cwd));
  });
});
