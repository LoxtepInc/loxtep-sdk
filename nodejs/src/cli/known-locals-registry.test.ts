/**
 * Tests: known-locals registry round-trip (LOX-1186).
 */

import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  KnownLocalsRegistrySchema,
  loadKnownLocalsRegistry,
  upsertKnownLocal,
  knownLocalProjectIds,
  listKnownLocalsPresent,
  getWorkspacesRegistryPath,
} from './known-locals-registry.js';

function makeTempDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('known-locals registry', () => {
  let configDir: string;
  let registryPath: string;
  let prevEnv: string | undefined;

  beforeEach(() => {
    configDir = makeTempDir('loxtep-known-locals');
    registryPath = join(configDir, 'workspaces.json');
    prevEnv = process.env.LOXTEP_CONFIG_DIR;
    process.env.LOXTEP_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.LOXTEP_CONFIG_DIR;
    } else {
      process.env.LOXTEP_CONFIG_DIR = prevEnv;
    }
    rmSync(configDir, { recursive: true, force: true });
  });

  it('getWorkspacesRegistryPath respects LOXTEP_CONFIG_DIR', () => {
    expect(getWorkspacesRegistryPath()).toBe(registryPath);
  });

  it('load returns empty registry when file missing', () => {
    const reg = loadKnownLocalsRegistry(registryPath);
    expect(reg).toEqual({ schema_version: 1, workspaces: [] });
  });

  it('upsert writes valid schema and rounds trips', async () => {
    const ws = makeTempDir('loxtep-ws');
    try {
      const entry = await upsertKnownLocal({
        path: ws,
        project_id: '11111111-1111-1111-1111-111111111111',
        registryPath,
      });
      expect(entry.path).toBe(ws);
      expect(entry.project_id).toBe('11111111-1111-1111-1111-111111111111');
      expect(entry.last_seen_at).toMatch(/^\d{4}-/);

      expect(existsSync(registryPath)).toBe(true);
      const raw = JSON.parse(readFileSync(registryPath, 'utf-8'));
      const parsed = KnownLocalsRegistrySchema.parse(raw);
      expect(parsed.workspaces).toHaveLength(1);
      expect(parsed.workspaces[0].project_id).toBe(entry.project_id);

      const ids = knownLocalProjectIds(registryPath);
      expect(ids.has(entry.project_id)).toBe(true);
      expect(listKnownLocalsPresent(registryPath)).toHaveLength(1);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('upsert updates same path and demotes duplicate project_id rows', async () => {
    const a = makeTempDir('loxtep-ws-a');
    const b = makeTempDir('loxtep-ws-b');
    try {
      await upsertKnownLocal({
        path: a,
        project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        registryPath,
      });
      await upsertKnownLocal({
        path: b,
        project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        registryPath,
      });
      const reg = loadKnownLocalsRegistry(registryPath);
      expect(reg.workspaces).toHaveLength(1);
      expect(reg.workspaces[0].path).toBe(b);

      await upsertKnownLocal({
        path: b,
        project_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        registryPath,
      });
      const reg2 = loadKnownLocalsRegistry(registryPath);
      expect(reg2.workspaces).toHaveLength(1);
      expect(reg2.workspaces[0].project_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('listKnownLocalsPresent skips missing paths', async () => {
    const gone = join(configDir, 'missing-ws');
    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          schema_version: 1,
          workspaces: [
            {
              path: gone,
              project_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              last_seen_at: new Date().toISOString(),
            },
          ],
        },
        null,
        2
      )
    );
    expect(listKnownLocalsPresent(registryPath)).toHaveLength(0);
    expect(knownLocalProjectIds(registryPath).size).toBe(1);
  });
});
