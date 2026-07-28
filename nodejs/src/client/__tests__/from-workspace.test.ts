/**
 * Unit tests for `LoxtepClient.fromWorkspace()` (R13.1–R13.4).
 *
 * Workspace shapes come from `shared/fixtures/workspace` so Node and Python
 * cannot silently diverge on attach-written project.json / credentials.
 */

import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LoxtepClient } from '../loxtep-client.js';
import { ValidationError } from '../../errors/validation.js';
import { CONFIG_DIR_ENV } from '../../config/paths.js';

// jest/ts-jest provides __dirname for this file (nodejs/src/client/__tests__).
const WORKSPACE_FIXTURES = join(__dirname, '../../../../shared/fixtures/workspace');

describe('LoxtepClient.fromWorkspace()', () => {
  const origEnv = { ...process.env };
  let tmpRoot: string;
  let emptyGlobal: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'loxtep-from-ws-'));
    emptyGlobal = await mkdtemp(join(tmpdir(), 'loxtep-cfg-'));
    process.env[CONFIG_DIR_ENV] = emptyGlobal;
    delete process.env.LOXTEP_API_URL;
    delete process.env.LOXTEP_PROJECT_ID;
    delete process.env.LOXTEP_INSTANCE_ID;
    delete process.env.LOXTEP_TOKEN;
    delete process.env.LOXTEP_ORGANIZATION_ID;
    delete process.env.LOXTEP_REGION;
  });

  afterEach(async () => {
    process.env = { ...origEnv };
    await rm(tmpRoot, { recursive: true, force: true });
    await rm(emptyGlobal, { recursive: true, force: true });
  });

  async function installWorkspace(
    dir: string,
    opts: { project?: string; credentials?: string | null } = {}
  ): Promise<void> {
    const projectFile = opts.project ?? 'project.json';
    const credentials = opts.credentials === undefined ? 'credentials.json' : opts.credentials;
    const loxtepDir = join(dir, '.loxtep');
    await mkdir(loxtepDir, { recursive: true });
    await copyFile(join(WORKSPACE_FIXTURES, projectFile), join(loxtepDir, 'project.json'));
    if (credentials !== null) {
      await copyFile(join(WORKSPACE_FIXTURES, credentials), join(loxtepDir, 'credentials.json'));
    }
  }

  describe('R13.4: fails with descriptive error naming the missing file', () => {
    it('throws ValidationError naming project.json when api_url cannot be resolved', () => {
      expect(() => LoxtepClient.fromWorkspace({ cwd: tmpRoot })).toThrow(ValidationError);
      try {
        LoxtepClient.fromWorkspace({ cwd: tmpRoot });
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).message).toMatch(/project\.json/);
      }
    });

    it('throws ValidationError naming credentials.json when project.json is present but no token', async () => {
      await installWorkspace(tmpRoot, {
        project: 'project-minimal.json',
        credentials: null,
      });

      expect(() => LoxtepClient.fromWorkspace({ cwd: tmpRoot })).toThrow(ValidationError);
      try {
        LoxtepClient.fromWorkspace({ cwd: tmpRoot });
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).message).toMatch(/credentials\.json/);
      }
    });
  });

  describe('R13.1: resolves fields from workspace files', () => {
    it('constructs a client from shared attach-shaped fixtures', async () => {
      await installWorkspace(tmpRoot);

      const client = LoxtepClient.fromWorkspace({ cwd: tmpRoot });
      expect(client.api_url).toBe('https://apidev.loxtep.io');
      expect(client.project_id).toBe('proj-1');
      expect(client.instance_id).toBe('inst-1');
      expect(client.organization_id).toBe('org-1');
    });
  });

  describe('R13.3: explicit config overrides workspace values', () => {
    it('explicit api_url takes precedence over workspace-resolved api_url', async () => {
      await installWorkspace(tmpRoot, { project: 'project-minimal.json' });

      const client = LoxtepClient.fromWorkspace({
        cwd: tmpRoot,
        api_url: 'https://explicit.loxtep.io',
      });
      expect(client.api_url).toBe('https://explicit.loxtep.io');
      expect(client.project_id).toBe('proj-1');
      expect(client.instance_id).toBe('i1');
    });

    it('explicit token takes precedence over credentials.json', async () => {
      await installWorkspace(tmpRoot, {
        project: 'project-minimal.json',
        credentials: null,
      });

      const client = LoxtepClient.fromWorkspace({
        cwd: tmpRoot,
        token: 'my-explicit-token',
      });
      expect(client.api_url).toBe('https://api.example');
      expect(client.auth).toEqual({ type: 'jwt', token: 'my-explicit-token' });
    });

    it('env var overrides both explicit and workspace', async () => {
      await installWorkspace(tmpRoot, { project: 'project-minimal.json' });
      process.env.LOXTEP_API_URL = 'https://env.loxtep.io';
      process.env.LOXTEP_TOKEN = 'env-token';

      const client = LoxtepClient.fromWorkspace({
        cwd: tmpRoot,
        api_url: 'https://explicit.loxtep.io',
        token: 'explicit-token',
      });
      expect(client.api_url).toBe('https://env.loxtep.io');
    });
  });

  describe('R13.2: emits debug log naming resolved files', () => {
    it('calls the debug logger with resolved file paths including project.json', async () => {
      await installWorkspace(tmpRoot, { project: 'project-minimal.json' });

      const debugMessages: string[] = [];
      LoxtepClient.fromWorkspace({
        cwd: tmpRoot,
        debug: msg => {
          debugMessages.push(msg);
        },
      });

      expect(debugMessages.length).toBeGreaterThan(0);
      const resolvedMsg = debugMessages.find(m => m.includes('Auto-config resolved from:'));
      expect(resolvedMsg).toBeDefined();
      expect(resolvedMsg).toMatch(/project\.json/);
      expect(resolvedMsg).toMatch(/credentials\.json/);
    });

    it('logs "no workspace configuration files found" when only env vars provide config', () => {
      process.env.LOXTEP_API_URL = 'https://env.loxtep.io';
      process.env.LOXTEP_TOKEN = 'env-tok';

      const debugMessages: string[] = [];
      LoxtepClient.fromWorkspace({
        cwd: tmpRoot,
        debug: msg => {
          debugMessages.push(msg);
        },
      });

      const noFilesMsg = debugMessages.find(m =>
        m.includes('no workspace configuration files found')
      );
      expect(noFilesMsg).toBeDefined();
    });

    it('uses console.debug by default when no debug function is provided', async () => {
      await installWorkspace(tmpRoot, { project: 'project-minimal.json' });

      const spy = jest.spyOn(console, 'debug').mockImplementation(() => {});
      try {
        LoxtepClient.fromWorkspace({ cwd: tmpRoot });
        expect(spy).toHaveBeenCalled();
        const calls = spy.mock.calls.map(c => c[0] as string);
        const resolvedMsg = calls.find(
          m => typeof m === 'string' && m.includes('Auto-config resolved from:')
        );
        expect(resolvedMsg).toBeDefined();
        expect(resolvedMsg).toMatch(/project\.json/);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('R13.4: checks only when fromWorkspace() is called', () => {
    it('does NOT throw during regular LoxtepClient construction without workspace files', () => {
      expect(
        () =>
          new LoxtepClient({
            api_url: 'https://api.test.io',
            auth: { type: 'jwt', token: 'tok' },
          })
      ).not.toThrow();
    });
  });

  it('LOXTEP_CONFIG_DIR isolates global credentials from the real home dir', async () => {
    await installWorkspace(tmpRoot, {
      project: 'project-minimal.json',
      credentials: null,
    });
    // Write a decoy into emptyGlobal — should NOT be used if local is missing... wait,
    // resolveCredentialsPath falls back to global. Put token only in CONFIG_DIR.
    await writeFile(
      join(emptyGlobal, 'credentials.json'),
      JSON.stringify({ access_token: 'from-config-dir' })
    );

    const client = LoxtepClient.fromWorkspace({ cwd: tmpRoot });
    expect(client.auth).toEqual({ type: 'jwt', token: 'from-config-dir' });
  });
});
