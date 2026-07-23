import { mkdir, writeFile, readFile, rm, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  requireProject,
  requireAttachedProject,
  writeProjectConfig,
  findProjectDir,
  getProjectFilePath,
  preconditionToCliResult,
  ProjectConfigSchema,
} from './project-context.js';
import { ValidationError } from '../errors/validation.js';

describe('project-context', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'loxtep-project-context-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeProjectFile(dir: string, contents: unknown): Promise<string> {
    const filePath = getProjectFilePath(dir);
    await mkdir(join(dir, '.loxtep'), { recursive: true });
    await writeFile(
      filePath,
      typeof contents === 'string' ? contents : JSON.stringify(contents),
      'utf-8'
    );
    return filePath;
  }

  describe('requireProject', () => {
    it('returns NO_PROJECT when no .loxtep/project.json exists in cwd or any parent', () => {
      const result = requireProject(tmpDir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe('NO_PROJECT');
        expect(result.failure.message).toMatch(/loxtep init/);
      }
    });

    it('resolves a project file located in the cwd', async () => {
      await writeProjectFile(tmpDir, { project_id: 'proj-1' });
      const result = requireProject(tmpDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.project.project_id).toBe('proj-1');
        expect(result.projectDir).toBe(tmpDir);
      }
    });

    it('searches upward to find the project file in a parent directory', async () => {
      await writeProjectFile(tmpDir, { project_id: 'proj-upward' });
      const nested = join(tmpDir, 'a', 'b', 'c');
      await mkdir(nested, { recursive: true });
      const result = requireProject(nested);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.projectDir).toBe(tmpDir);
        expect(result.project.project_id).toBe('proj-upward');
      }
    });

    it('returns NO_PROJECT when the file is invalid JSON', async () => {
      await writeProjectFile(tmpDir, '{ not json');
      const result = requireProject(tmpDir);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.code).toBe('NO_PROJECT');
    });

    it('returns NO_PROJECT when project_id is missing', async () => {
      await writeProjectFile(tmpDir, { organization_id: 'org-1' });
      const result = requireProject(tmpDir);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.code).toBe('NO_PROJECT');
    });

    it('rejects local-only proj_local_* project_id with upgrade guidance', async () => {
      await writeProjectFile(tmpDir, { project_id: 'proj_local_deadbeef' });
      const result = requireProject(tmpDir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe('NO_PROJECT');
        expect(result.failure.message).toMatch(/not registered on the platform/);
        expect(result.failure.message).toMatch(/init --project-id/);
      }
    });
  });

  describe('requireAttachedProject', () => {
    it('returns NOT_ATTACHED when instance_id/api_url are missing', async () => {
      await writeProjectFile(tmpDir, { project_id: 'proj-1' });
      const result = requireAttachedProject(tmpDir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe('NOT_ATTACHED');
        expect(result.failure.message).toMatch(/loxtep attach/);
      }
    });

    it('returns NOT_ATTACHED when only instance_id is present', async () => {
      await writeProjectFile(tmpDir, { project_id: 'proj-1', instance_id: 'inst-1' });
      const result = requireAttachedProject(tmpDir);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.code).toBe('NOT_ATTACHED');
    });

    it('returns NO_PROJECT (not NOT_ATTACHED) when no project file exists', () => {
      const result = requireAttachedProject(tmpDir);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.code).toBe('NO_PROJECT');
    });

    it('succeeds with narrowed types when attached', async () => {
      await writeProjectFile(tmpDir, {
        project_id: 'proj-1',
        instance_id: 'inst-1',
        api_url: 'https://apidev.loxtep.io',
      });
      const result = requireAttachedProject(tmpDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.project.instance_id).toBe('inst-1');
        expect(result.project.api_url).toBe('https://apidev.loxtep.io');
      }
    });
  });

  describe('writeProjectConfig (atomic build-validate-write-once)', () => {
    it('writes a valid config and applies repository.branch default', async () => {
      const filePath = getProjectFilePath(tmpDir);
      const written = await writeProjectConfig(filePath, {
        project_id: 'proj-1',
        instance_id: 'inst-1',
        api_url: 'https://apidev.loxtep.io',
        repository: { url: 'https://github.com/acme/repo', name: 'repo' },
      });
      expect(written.repository?.branch).toBe('main');
      const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>;
      expect(parsed.project_id).toBe('proj-1');
      expect((parsed.repository as Record<string, unknown>).branch).toBe('main');
    });

    it('creates the .loxtep directory if missing', async () => {
      const filePath = getProjectFilePath(tmpDir);
      expect(existsSync(join(tmpDir, '.loxtep'))).toBe(false);
      await writeProjectConfig(filePath, { project_id: 'proj-1' });
      expect(existsSync(filePath)).toBe(true);
    });

    it('throws ValidationError before touching disk when config is invalid', async () => {
      const filePath = getProjectFilePath(tmpDir);
      await expect(writeProjectConfig(filePath, { organization_id: 'org-1' })).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(existsSync(filePath)).toBe(false);
    });

    it('leaves the prior file unchanged when a new write is rejected by validation', async () => {
      const filePath = getProjectFilePath(tmpDir);
      await writeProjectConfig(filePath, { project_id: 'proj-1' });
      const before = await readFile(filePath, 'utf-8');
      await expect(writeProjectConfig(filePath, { instance_id: 'no-project-id' })).rejects.toBeInstanceOf(
        ValidationError
      );
      const after = await readFile(filePath, 'utf-8');
      expect(after).toBe(before);
    });

    it('leaves no stray temp files in the .loxtep directory after a write', async () => {
      const filePath = getProjectFilePath(tmpDir);
      await writeProjectConfig(filePath, { project_id: 'proj-1' });
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(join(tmpDir, '.loxtep'));
      expect(entries).toEqual(['project.json']);
    });
  });

  describe('helpers', () => {
    it('findProjectDir returns null when nothing is found', () => {
      expect(findProjectDir(tmpDir)).toBeNull();
    });

    it('preconditionToCliResult maps a failure to a non-zero CliResult', () => {
      const cli = preconditionToCliResult({ code: 'NO_PROJECT', message: 'run init' });
      expect(cli.exitCode).toBe(1);
      expect(cli.stderr).toEqual(['run init']);
      expect(cli.stdout).toEqual([]);
    });

    it('ProjectConfigSchema strips unknown keys', () => {
      const parsed = ProjectConfigSchema.parse({ project_id: 'p', extra: 'nope' });
      expect(parsed).not.toHaveProperty('extra');
    });
  });
});
