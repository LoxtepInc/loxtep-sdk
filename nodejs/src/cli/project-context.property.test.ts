import fc from 'fast-check';
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  requireProject,
  requireAttachedProject,
  getProjectFilePath,
} from './project-context.js';

/**
 * Feature: ai-first-platform-surface
 * Property 2: CLI command precondition guard
 *
 * For any command in {generate, test, deploy} and any project state, the command
 * exits with a non-zero status when its precondition is unmet: it directs the
 * developer to run `init` when no `.loxtep/project.json` exists upward from the
 * working directory, and to run `attach` when `.loxtep/project.json` exists but
 * lacks a resolved `instance_id` and `api_url`.
 *
 * **Validates: Requirements 1.7, 1.10**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary non-empty string suitable for project_id values. */
const projectIdArb = fc.stringMatching(/^[a-z][a-z0-9_-]{2,30}$/);

/** Arbitrary non-empty string suitable for instance_id values. */
const instanceIdArb = fc.stringMatching(/^inst_[a-z0-9]{4,20}$/);

/** Arbitrary URL-like string suitable for api_url values. */
const apiUrlArb = fc.stringMatching(/^https:\/\/api[a-z]{0,5}\.loxtep\.io$/);

/** Commands that require an attached project (generate, test, deploy). */
const attachedCommandArb = fc.constantFrom('generate', 'test', 'deploy');

/**
 * Arbitrary project config that is unattached: has project_id but is
 * missing instance_id, api_url, or both.
 */
const unattachedConfigArb = fc.record({
  project_id: projectIdArb,
  instance_id: fc.oneof(fc.constant(undefined), fc.constant('')),
  api_url: fc.oneof(fc.constant(undefined), fc.constant('')),
}).map(cfg => {
  const result: Record<string, unknown> = { project_id: cfg.project_id };
  if (cfg.instance_id !== undefined && cfg.instance_id !== '') {
    result.instance_id = cfg.instance_id;
  }
  if (cfg.api_url !== undefined && cfg.api_url !== '') {
    result.api_url = cfg.api_url;
  }
  return result;
});

/**
 * Arbitrary project config that IS fully attached: has project_id,
 * instance_id, and api_url all present and non-empty.
 */
const attachedConfigArb = fc.record({
  project_id: projectIdArb,
  instance_id: instanceIdArb,
  api_url: apiUrlArb,
});

/**
 * Arbitrary nested subdirectory depth (1-4 levels below the project root)
 * to exercise the upward-search behavior.
 */
const nestedDepthArb = fc.integer({ min: 0, max: 4 });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'loxtep-pbt-precond-'));
}

async function writeProjectFile(dir: string, contents: unknown): Promise<void> {
  const filePath = getProjectFilePath(dir);
  await mkdir(join(dir, '.loxtep'), { recursive: true });
  await writeFile(filePath, JSON.stringify(contents), 'utf-8');
}

async function makeNestedDir(base: string, depth: number): Promise<string> {
  if (depth === 0) return base;
  const segments = Array.from({ length: depth }, (_, i) => `sub${i}`);
  const nested = join(base, ...segments);
  await mkdir(nested, { recursive: true });
  return nested;
}

// ─── Property Test ────────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 2: CLI command precondition guard', () => {
  const tmpDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(tmpDirs.map(d => rm(d, { recursive: true, force: true })));
  });

  it(
    'R1.7: For any command in {generate, test, deploy} run outside a directory containing ' +
      '.loxtep/project.json, requireProject returns NO_PROJECT with guidance to run `loxtep init`',
    async () => {
      await fc.assert(
        fc.asyncProperty(attachedCommandArb, nestedDepthArb, async (_command, depth) => {
          // Create a fresh temp directory with NO .loxtep/project.json anywhere.
          const tmpDir = await createTmpDir();
          tmpDirs.push(tmpDir);
          const cwd = await makeNestedDir(tmpDir, depth);

          // The precondition guard should fail with NO_PROJECT.
          const result = requireProject(cwd);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.failure.code).toBe('NO_PROJECT');
            expect(result.failure.message.toLowerCase()).toContain('loxtep init');
          }

          // requireAttachedProject should also fail with NO_PROJECT (not NOT_ATTACHED).
          const attachedResult = requireAttachedProject(cwd);
          expect(attachedResult.ok).toBe(false);
          if (!attachedResult.ok) {
            expect(attachedResult.failure.code).toBe('NO_PROJECT');
            expect(attachedResult.failure.message.toLowerCase()).toContain('loxtep init');
          }
        }),
        { numRuns: 100 }
      );
    },
    30_000
  );

  it(
    'R1.10: For any command in {generate, test, deploy} run in a project whose .loxtep/project.json ' +
      'does not yet contain a resolved instance_id and api_url, requireAttachedProject returns ' +
      'NOT_ATTACHED with guidance to run `loxtep attach`',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          attachedCommandArb,
          unattachedConfigArb,
          nestedDepthArb,
          async (_command, config, depth) => {
            // Create a temp directory with a valid but unattached project.json.
            const tmpDir = await createTmpDir();
            tmpDirs.push(tmpDir);
            await writeProjectFile(tmpDir, config);
            const cwd = await makeNestedDir(tmpDir, depth);

            // requireProject succeeds (the file is valid JSON with project_id).
            const projectResult = requireProject(cwd);
            expect(projectResult.ok).toBe(true);

            // requireAttachedProject fails with NOT_ATTACHED.
            const result = requireAttachedProject(cwd);
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.failure.code).toBe('NOT_ATTACHED');
              expect(result.failure.message.toLowerCase()).toContain('loxtep attach');
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  it(
    'Positive case: For any fully attached project, requireAttachedProject succeeds ' +
      'with narrowed instance_id and api_url regardless of nesting depth',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          attachedCommandArb,
          attachedConfigArb,
          nestedDepthArb,
          async (_command, config, depth) => {
            const tmpDir = await createTmpDir();
            tmpDirs.push(tmpDir);
            await writeProjectFile(tmpDir, config);
            const cwd = await makeNestedDir(tmpDir, depth);

            const result = requireAttachedProject(cwd);
            expect(result.ok).toBe(true);
            if (result.ok) {
              expect(result.project.instance_id).toBe(config.instance_id);
              expect(result.project.api_url).toBe(config.api_url);
              expect(result.project.project_id).toBe(config.project_id);
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});
