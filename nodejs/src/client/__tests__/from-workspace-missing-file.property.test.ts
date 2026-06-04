/**
 * Property 38: fromWorkspace missing-file error
 *
 * For arbitrary working directories without the required workspace files,
 * `LoxtepClient.fromWorkspace()` throws a `ValidationError` that names the
 * specific missing file in its error message.
 *
 * The factory checks for required files only when called (not at import or
 * class definition time) and identifies which file is absent so the developer
 * knows what to fix.
 *
 * **Validates: Requirements 13.4**
 *
 * Tagged: Feature: ai-first-platform-surface, Property 38: fromWorkspace missing-file error
 */

import fc from 'fast-check';
import { mkdir, rm, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LoxtepClient } from '../loxtep-client';
import { ValidationError } from '../../errors/validation';

/* ------------------------------------------------------------------ */
/*  Mock getConfigDir to use a temp dir (avoids reading real creds)   */
/* ------------------------------------------------------------------ */

let mockConfigDir = '/tmp/nonexistent-loxtep-config';

jest.mock('../../config/paths', () => ({
  getConfigDir: () => mockConfigDir,
  getDefaultConfigPath: () => join(mockConfigDir, 'config.json'),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Env vars that resolveAutoConfig reads — we clear them during the test. */
const AUTO_CONFIG_ENV_VARS = [
  'LOXTEP_API_URL',
  'LOXTEP_PROJECT_ID',
  'LOXTEP_INSTANCE_ID',
  'LOXTEP_TOKEN',
] as const;

const originalEnv: Record<string, string | undefined> = {};

function clearAutoConfigEnvVars(): void {
  for (const key of AUTO_CONFIG_ENV_VARS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreAutoConfigEnvVars(): void {
  for (const key of AUTO_CONFIG_ENV_VARS) {
    if (originalEnv[key] !== undefined) {
      process.env[key] = originalEnv[key];
    } else {
      delete process.env[key];
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Arbitraries                                                       */
/* ------------------------------------------------------------------ */

/**
 * Arbitrary directory name segment (safe filesystem chars, non-empty).
 */
const dirSegmentArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/, { size: 'small' });

/**
 * Arbitrary nested directory depth (1–4 segments below the tmp root).
 */
const dirDepthArb = fc.integer({ min: 1, max: 4 });

/**
 * A URL-like string for api_url fields.
 */
const apiUrlArb = fc
  .tuple(
    fc.constantFrom('https://', 'http://'),
    fc.stringMatching(/^[a-z][a-z0-9.-]{1,20}$/, { size: 'small' }),
    fc.constantFrom('.loxtep.io', '.test.io', '.example.com'),
  )
  .map(([scheme, host, tld]) => `${scheme}${host}${tld}`);

/**
 * A project_id-like string.
 */
const projectIdArb = fc.stringMatching(/^[a-z][a-z0-9_-]{2,20}$/, { size: 'small' });

/**
 * An instance_id-like string.
 */
const instanceIdArb = fc.stringMatching(/^[a-z][a-z0-9_-]{2,20}$/, { size: 'small' });

/**
 * A token-like string.
 */
const tokenArb = fc.stringMatching(/^[A-Za-z0-9._-]{5,40}$/, { size: 'small' });

/**
 * Workspace config representing a complete `.loxtep/project.json`.
 */
const workspaceConfigArb = fc.record({
  api_url: apiUrlArb,
  project_id: projectIdArb,
  instance_id: instanceIdArb,
});

/* ------------------------------------------------------------------ */
/*  Property 38: fromWorkspace missing-file error                     */
/* ------------------------------------------------------------------ */

describe('Property 38: fromWorkspace missing-file error', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'loxtep-missing-file-pbt-'));
    // Point the mock config dir to a nonexistent subdir of our temp root
    // so that ~/.loxtep/credentials.json does NOT exist
    mockConfigDir = join(tmpRoot, 'fake-loxtep-config');
    clearAutoConfigEnvVars();
  });

  afterEach(async () => {
    restoreAutoConfigEnvVars();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('throws ValidationError naming project.json when no .loxtep/project.json exists and no env/explicit api_url is provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        dirSegmentArb,
        dirDepthArb,
        async (segment, depth) => {
          // --- Arrange: create a directory tree with NO .loxtep/project.json ---
          let workDir = join(tmpRoot, `run-${segment}-${Math.random().toString(36).slice(2)}`);
          for (let i = 0; i < depth; i++) {
            workDir = join(workDir, `sub${i}`);
          }
          await mkdir(workDir, { recursive: true });

          // No .loxtep/ directory exists anywhere in the path tree
          // No env vars are set (cleared in beforeEach)
          // No explicit config is passed
          // mockConfigDir points to nonexistent dir (no credentials.json)

          // --- Act & Assert ---
          let threw = false;
          let caughtErr: unknown;
          try {
            LoxtepClient.fromWorkspace({ cwd: workDir });
          } catch (err) {
            threw = true;
            caughtErr = err;
          }

          // R13.4: must throw when required file is absent
          expect(threw).toBe(true);
          // R13.4: must be a ValidationError
          expect(caughtErr).toBeInstanceOf(ValidationError);
          const ve = caughtErr as ValidationError;
          // R13.4: must name the specific missing file (project.json)
          expect(ve.message).toContain('project.json');
        }
      ),
      { numRuns: 100 },
    );
  });

  it('throws ValidationError naming credentials.json when project.json is present but no token source exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceConfigArb,
        dirSegmentArb,
        async (projectConfig, segment) => {
          // --- Arrange: create .loxtep/project.json with api_url (so api_url resolves) ---
          const workDir = join(tmpRoot, `run-${segment}-${Math.random().toString(36).slice(2)}`);
          const loxtepDir = join(workDir, '.loxtep');
          await mkdir(loxtepDir, { recursive: true });
          await writeFile(
            join(loxtepDir, 'project.json'),
            JSON.stringify(projectConfig)
          );

          // mockConfigDir points to nonexistent dir — no credentials.json
          // No env LOXTEP_TOKEN, no explicit token

          // --- Act & Assert ---
          let threw = false;
          let caughtErr: unknown;
          try {
            LoxtepClient.fromWorkspace({ cwd: workDir });
          } catch (err) {
            threw = true;
            caughtErr = err;
          }

          // R13.4: must throw when required file is absent
          expect(threw).toBe(true);
          // R13.4: must be a ValidationError
          expect(caughtErr).toBeInstanceOf(ValidationError);
          const ve = caughtErr as ValidationError;
          // R13.4: must name the specific missing file (credentials.json)
          expect(ve.message).toContain('credentials.json');
        }
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT throw during regular LoxtepClient construction (checks only when fromWorkspace() is called)', async () => {
    await fc.assert(
      fc.asyncProperty(
        apiUrlArb,
        tokenArb,
        async (apiUrl, token) => {
          // --- Arrange: no workspace files at all, but constructor is given explicit config ---
          // Regular constructor does NOT check for workspace files (R13.4: only fromWorkspace does)
          const client = new LoxtepClient({
            api_url: apiUrl,
            auth: { type: 'jwt', token },
          });

          // --- Assert: construction succeeds without any filesystem checks ---
          expect(client).toBeInstanceOf(LoxtepClient);
          expect(client.api_url).toBeTruthy();
        }
      ),
      { numRuns: 100 },
    );
  });
});
