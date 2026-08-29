/**
 * config set instance_id also writes workspace .loxtep/project.json.
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CONFIG_DIR_ENV } from '../../config/paths.js';
import { runConfigSet } from './config-cmd.js';

function makeTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('runConfigSet instance_id', () => {
  const origEnv = { ...process.env };
  let tmpDirs: string[] = [];

  afterEach(() => {
    process.env = { ...origEnv };
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  it('writes instance_id and known api_url into workspace project.json', async () => {
    const cwd = makeTmpDir('loxtep-config-set-ws');
    const globalDir = makeTmpDir('loxtep-config-set-global');
    tmpDirs.push(cwd, globalDir);
    process.env[CONFIG_DIR_ENV] = globalDir;

    mkdirSync(join(cwd, '.loxtep'), { recursive: true });
    writeFileSync(
      join(cwd, '.loxtep', 'project.json'),
      JSON.stringify({ project_id: 'proj-1', organization_id: 'org-1' }, null, 2)
    );
    writeFileSync(
      join(globalDir, 'config.json'),
      JSON.stringify({ api_url: 'https://apidev.loxtep.io' }, null, 2)
    );

    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runConfigSet('instance_id', 'inst-from-config', { cwd });
    } finally {
      log.mockRestore();
    }

    const written = JSON.parse(readFileSync(join(cwd, '.loxtep', 'project.json'), 'utf-8'));
    expect(written.project_id).toBe('proj-1');
    expect(written.organization_id).toBe('org-1');
    expect(written.instance_id).toBe('inst-from-config');
    expect(written.api_url).toBe('https://apidev.loxtep.io');

    const global = JSON.parse(readFileSync(join(globalDir, 'config.json'), 'utf-8'));
    expect(global.instance_id).toBe('inst-from-config');
  });
});
