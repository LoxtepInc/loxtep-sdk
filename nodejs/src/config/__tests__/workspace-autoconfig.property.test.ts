/**
 * Property 36: SDK auto-config resolution
 *
 * For arbitrary valid workspace configs (`.loxtep/project.json` + `~/.loxtep/credentials.json`),
 * `resolveAutoConfig()` correctly resolves all fields from the workspace files when no
 * env vars or explicit config overrides are provided.
 *
 * **Validates: Requirements 13.1**
 *
 * Tagged: Feature: ai-first-platform-surface, Property 36: SDK auto-config resolution
 */

import fc from 'fast-check';
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveAutoConfig } from '../workspace-config';

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
 * Non-empty, trimmed string safe for JSON (no control chars, no whitespace-only).
 */
const safeNonEmptyString = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0 && !s.includes('\x00'))
  .map((s) => s.trim());

/**
 * A URL-like string for api_url fields.
 */
const apiUrlArb = fc
  .tuple(
    fc.constantFrom('https://', 'http://'),
    fc.stringMatching(/^[a-z][a-z0-9.-]{1,30}$/, { size: 'small' }),
    fc.constantFrom('.loxtep.io', '.test.io', '.example.com'),
  )
  .map(([scheme, host, tld]) => `${scheme}${host}${tld}`);

/**
 * A project_id-like string (non-empty, trimmed).
 */
const projectIdArb = fc
  .stringMatching(/^[a-z][a-z0-9_-]{2,30}$/, { size: 'small' });

/**
 * An instance_id-like string (non-empty, trimmed).
 */
const instanceIdArb = fc
  .stringMatching(/^[a-z][a-z0-9_-]{2,30}$/, { size: 'small' });

/**
 * A token-like string (non-empty, trimmed).
 */
const tokenArb = fc
  .stringMatching(/^[A-Za-z0-9._-]{5,60}$/, { size: 'small' });

/**
 * Arbitrary workspace config representing a `.loxtep/project.json` file
 * with all fields populated (api_url, project_id, instance_id).
 */
const workspaceConfigArb = fc.record({
  api_url: apiUrlArb,
  project_id: projectIdArb,
  instance_id: instanceIdArb,
});

/**
 * Arbitrary credentials representing `~/.loxtep/credentials.json` with an access_token.
 */
const credentialsArb = fc.record({
  access_token: tokenArb,
});

/* ------------------------------------------------------------------ */
/*  Property 36: SDK auto-config resolution                           */
/* ------------------------------------------------------------------ */

describe('Property 36: SDK auto-config resolution', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'loxtep-autoconfig-pbt-'));
    clearAutoConfigEnvVars();
  });

  afterEach(async () => {
    restoreAutoConfigEnvVars();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('resolveAutoConfig resolves all fields from workspace files when no env or explicit overrides are present', async () => {
    await fc.assert(
      fc.asyncProperty(workspaceConfigArb, credentialsArb, async (projectConfig, credentials) => {
        // --- Arrange: create .loxtep/project.json in a unique subdir ---
        const workDir = join(tmpRoot, `run-${Math.random().toString(36).slice(2)}`);
        const loxtepDir = join(workDir, '.loxtep');
        await mkdir(loxtepDir, { recursive: true });
        await writeFile(
          join(loxtepDir, 'project.json'),
          JSON.stringify(projectConfig)
        );

        // Note: credentials.json is at ~/.loxtep/credentials.json (global path).
        // We can't safely write to the user's home directory in a test, so we test
        // the workspace fields (api_url, project_id, instance_id) from project.json.
        // The token field resolution from credentials.json is covered by unit tests.

        // --- Act: resolve auto-config from workspace with no env vars, no explicit ---
        const result = resolveAutoConfig(undefined, workDir);

        // --- Assert: all fields from project.json are correctly resolved (R13.1) ---
        expect(result.api_url).toBe(projectConfig.api_url);
        expect(result.project_id).toBe(projectConfig.project_id);
        expect(result.instance_id).toBe(projectConfig.instance_id);

        // resolvedFiles should include the project.json path
        expect(result.resolvedFiles.some(f => f.includes('project.json'))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('resolveAutoConfig resolves fields from project.json identically regardless of surrounding directory depth', async () => {
    await fc.assert(
      fc.asyncProperty(workspaceConfigArb, fc.integer({ min: 1, max: 4 }), async (projectConfig, depth) => {
        // --- Arrange: create project.json at a root, then cwd in a nested subdir ---
        const workDir = join(tmpRoot, `depth-${Math.random().toString(36).slice(2)}`);
        const loxtepDir = join(workDir, '.loxtep');
        await mkdir(loxtepDir, { recursive: true });
        await writeFile(
          join(loxtepDir, 'project.json'),
          JSON.stringify(projectConfig)
        );

        // Create a nested subdir that should find the project.json via upward search
        let nestedDir = workDir;
        for (let i = 0; i < depth; i++) {
          nestedDir = join(nestedDir, `sub${i}`);
        }
        await mkdir(nestedDir, { recursive: true });

        // --- Act: resolve from the nested subdirectory ---
        const result = resolveAutoConfig(undefined, nestedDir);

        // --- Assert: same fields resolved via upward search ---
        expect(result.api_url).toBe(projectConfig.api_url);
        expect(result.project_id).toBe(projectConfig.project_id);
        expect(result.instance_id).toBe(projectConfig.instance_id);
      }),
      { numRuns: 100 },
    );
  });
});
