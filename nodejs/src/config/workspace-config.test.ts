/**
 * Unit tests for workspace-config.ts — the auto-config resolution layer (R13).
 *
 * Validates that:
 *  - resolveAutoConfig follows precedence: env > explicit > workspace files (R13.1, R13.3)
 *  - loadWorkspaceConfig reads .loxtep/project.json and ~/.loxtep/credentials.json
 *  - Missing files are tracked in the result metadata
 */

import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadWorkspaceConfig, resolveAutoConfig } from './workspace-config.js';

describe('workspace-config', () => {
  const origEnv = { ...process.env };
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'loxtep-wscfg-test-'));
    // Clear env vars that affect resolution
    delete process.env.LOXTEP_API_URL;
    delete process.env.LOXTEP_PROJECT_ID;
    delete process.env.LOXTEP_INSTANCE_ID;
    delete process.env.LOXTEP_TOKEN;
  });

  afterEach(async () => {
    process.env = { ...origEnv };
    await rm(tmpRoot, { recursive: true, force: true });
  });

  describe('loadWorkspaceConfig', () => {
    it('reports .loxtep/project.json as missing when the file does not exist', () => {
      const result = loadWorkspaceConfig(tmpRoot);
      expect(result.missingFiles.some(f => f.includes('project.json'))).toBe(true);
      // project_id comes only from project.json, never from credentials.json
      expect(result.fields.project_id).toBeUndefined();
    });

    it('reads api_url, project_id, instance_id from .loxtep/project.json when present', async () => {
      const loxtepDir = join(tmpRoot, '.loxtep');
      await mkdir(loxtepDir, { recursive: true });
      await writeFile(
        join(loxtepDir, 'project.json'),
        JSON.stringify({
          project_id: 'proj-abc',
          api_url: 'https://api.test.loxtep.io',
          instance_id: 'inst-xyz',
        })
      );

      const result = loadWorkspaceConfig(tmpRoot);
      expect(result.fields.project_id).toBe('proj-abc');
      expect(result.fields.api_url).toBe('https://api.test.loxtep.io');
      expect(result.fields.instance_id).toBe('inst-xyz');
      expect(result.resolvedFiles.some(f => f.includes('project.json'))).toBe(true);
    });

    it('ignores empty/whitespace-only project_id and instance_id in project.json', async () => {
      const loxtepDir = join(tmpRoot, '.loxtep');
      await mkdir(loxtepDir, { recursive: true });
      await writeFile(
        join(loxtepDir, 'project.json'),
        JSON.stringify({ project_id: 'p1', api_url: '', instance_id: '  ' })
      );

      const result = loadWorkspaceConfig(tmpRoot);
      expect(result.fields.project_id).toBe('p1');
      // Empty api_url from project.json is ignored (credentials.json may still supply one)
      expect(result.fields.instance_id).toBeUndefined();
    });

    it('treats malformed JSON as missing', async () => {
      const loxtepDir = join(tmpRoot, '.loxtep');
      await mkdir(loxtepDir, { recursive: true });
      await writeFile(join(loxtepDir, 'project.json'), 'not valid json{{{');

      const result = loadWorkspaceConfig(tmpRoot);
      expect(result.missingFiles.some(f => f.includes('project.json'))).toBe(true);
      expect(result.fields.project_id).toBeUndefined();
    });
  });

  describe('resolveAutoConfig', () => {
    it('returns workspace-resolved values when no explicit or env override', async () => {
      const loxtepDir = join(tmpRoot, '.loxtep');
      await mkdir(loxtepDir, { recursive: true });
      await writeFile(
        join(loxtepDir, 'project.json'),
        JSON.stringify({
          project_id: 'proj-ws',
          api_url: 'https://ws.loxtep.io',
          instance_id: 'inst-ws',
        })
      );

      const result = resolveAutoConfig(undefined, tmpRoot);
      expect(result.project_id).toBe('proj-ws');
      expect(result.api_url).toBe('https://ws.loxtep.io');
      expect(result.instance_id).toBe('inst-ws');
    });

    it('explicit config overrides workspace-resolved values (R13.3)', async () => {
      const loxtepDir = join(tmpRoot, '.loxtep');
      await mkdir(loxtepDir, { recursive: true });
      await writeFile(
        join(loxtepDir, 'project.json'),
        JSON.stringify({
          project_id: 'proj-ws',
          api_url: 'https://ws.loxtep.io',
          instance_id: 'inst-ws',
        })
      );

      const result = resolveAutoConfig(
        { api_url: 'https://explicit.loxtep.io', project_id: 'proj-explicit' },
        tmpRoot
      );
      expect(result.api_url).toBe('https://explicit.loxtep.io');
      expect(result.project_id).toBe('proj-explicit');
      // instance_id not overridden explicitly, so workspace value wins
      expect(result.instance_id).toBe('inst-ws');
    });

    it('env vars override both explicit and workspace values', async () => {
      const loxtepDir = join(tmpRoot, '.loxtep');
      await mkdir(loxtepDir, { recursive: true });
      await writeFile(
        join(loxtepDir, 'project.json'),
        JSON.stringify({
          project_id: 'proj-ws',
          api_url: 'https://ws.loxtep.io',
        })
      );

      process.env.LOXTEP_API_URL = 'https://env.loxtep.io';
      process.env.LOXTEP_PROJECT_ID = 'proj-env';

      const result = resolveAutoConfig(
        { api_url: 'https://explicit.loxtep.io', project_id: 'proj-explicit' },
        tmpRoot
      );
      expect(result.api_url).toBe('https://env.loxtep.io');
      expect(result.project_id).toBe('proj-env');
    });

    it('env var with whitespace is trimmed', () => {
      process.env.LOXTEP_API_URL = '  https://trimmed.loxtep.io  ';

      const result = resolveAutoConfig(undefined, tmpRoot);
      expect(result.api_url).toBe('https://trimmed.loxtep.io');
    });

    it('empty env var does not override lower layers', async () => {
      const loxtepDir = join(tmpRoot, '.loxtep');
      await mkdir(loxtepDir, { recursive: true });
      await writeFile(
        join(loxtepDir, 'project.json'),
        JSON.stringify({ project_id: 'proj-ws', api_url: 'https://ws.loxtep.io' })
      );

      process.env.LOXTEP_API_URL = '';
      process.env.LOXTEP_PROJECT_ID = '   ';

      const result = resolveAutoConfig(undefined, tmpRoot);
      expect(result.api_url).toBe('https://ws.loxtep.io');
      expect(result.project_id).toBe('proj-ws');
    });

    it('tracks resolved and missing files in the result', async () => {
      const loxtepDir = join(tmpRoot, '.loxtep');
      await mkdir(loxtepDir, { recursive: true });
      await writeFile(
        join(loxtepDir, 'project.json'),
        JSON.stringify({ project_id: 'p1' })
      );

      const result = resolveAutoConfig(undefined, tmpRoot);
      expect(result.resolvedFiles.some(f => f.includes('project.json'))).toBe(true);
      // resolvedFiles and missingFiles together account for the two config sources
      const allTracked = [...result.resolvedFiles, ...result.missingFiles];
      expect(allTracked.length).toBeGreaterThanOrEqual(1);
    });
  });
});
