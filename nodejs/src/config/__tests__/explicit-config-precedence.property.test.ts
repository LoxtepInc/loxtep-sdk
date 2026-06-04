/**
 * Property 37: Explicit-config precedence
 *
 * For arbitrary explicit config fields and workspace config files,
 * `resolveAutoConfig()` uses explicit configuration parameters in place of
 * workspace-resolved values, AND env vars override both.
 *
 * The three-layer precedence is: env > explicit > workspace files.
 *
 * **Validates: Requirements 13.3**
 *
 * Tagged: Feature: ai-first-platform-surface, Property 37: Explicit-config precedence
 */

import fc from 'fast-check';
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveAutoConfig } from '../workspace-config';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

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

/** URL-like string for api_url fields. */
const apiUrlArb = fc
  .tuple(
    fc.constantFrom('https://', 'http://'),
    fc.stringMatching(/^[a-z][a-z0-9.-]{1,20}$/, { size: 'small' }),
    fc.constantFrom('.loxtep.io', '.test.io', '.example.com'),
  )
  .map(([scheme, host, tld]) => `${scheme}${host}${tld}`);

/** project_id-like string. */
const projectIdArb = fc.stringMatching(/^[a-z][a-z0-9_-]{2,20}$/, { size: 'small' });

/** instance_id-like string. */
const instanceIdArb = fc.stringMatching(/^[a-z][a-z0-9_-]{2,20}$/, { size: 'small' });

/** token-like string. */
const tokenArb = fc.stringMatching(/^[A-Za-z0-9._-]{5,40}$/, { size: 'small' });

/**
 * Workspace config (project.json fields). All fields are present — so we can
 * confirm they get overridden by explicit config.
 */
const workspaceConfigArb = fc.record({
  api_url: apiUrlArb,
  project_id: projectIdArb,
  instance_id: instanceIdArb,
});

/**
 * Explicit config — all fields present and distinct from workspace values.
 * We generate two independent sets and use filtering to guarantee distinctness.
 */
const explicitConfigArb = fc.record({
  api_url: apiUrlArb,
  project_id: projectIdArb,
  instance_id: instanceIdArb,
  token: tokenArb,
});

/** Env var overrides — all fields present and distinct. */
const envConfigArb = fc.record({
  api_url: apiUrlArb,
  project_id: projectIdArb,
  instance_id: instanceIdArb,
  token: tokenArb,
});

/* ------------------------------------------------------------------ */
/*  Property 37: Explicit-config precedence                           */
/* ------------------------------------------------------------------ */

describe('Property 37: Explicit-config precedence', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'loxtep-explicit-pbt-'));
    clearAutoConfigEnvVars();
  });

  afterEach(async () => {
    restoreAutoConfigEnvVars();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('explicit config overrides workspace-resolved values for all fields (R13.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceConfigArb,
        explicitConfigArb,
        async (workspaceCfg, explicitCfg) => {
          // Ensure explicit values differ from workspace values for meaningful testing
          fc.pre(explicitCfg.api_url !== workspaceCfg.api_url);
          fc.pre(explicitCfg.project_id !== workspaceCfg.project_id);
          fc.pre(explicitCfg.instance_id !== workspaceCfg.instance_id);

          // --- Arrange: write workspace config ---
          const workDir = join(tmpRoot, `run-${Math.random().toString(36).slice(2)}`);
          const loxtepDir = join(workDir, '.loxtep');
          await mkdir(loxtepDir, { recursive: true });
          await writeFile(
            join(loxtepDir, 'project.json'),
            JSON.stringify(workspaceCfg)
          );

          // --- Act: resolve with explicit config (no env vars) ---
          const result = resolveAutoConfig(explicitCfg, workDir);

          // --- Assert: explicit values win over workspace values ---
          expect(result.api_url).toBe(explicitCfg.api_url);
          expect(result.project_id).toBe(explicitCfg.project_id);
          expect(result.instance_id).toBe(explicitCfg.instance_id);
          expect(result.token).toBe(explicitCfg.token);
        }
      ),
      { numRuns: 100 },
    );
  });

  it('env vars override explicit config which overrides workspace (full precedence chain)', async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceConfigArb,
        explicitConfigArb,
        envConfigArb,
        async (workspaceCfg, explicitCfg, envCfg) => {
          // Ensure all three layers have distinct values
          fc.pre(envCfg.api_url !== explicitCfg.api_url);
          fc.pre(envCfg.project_id !== explicitCfg.project_id);
          fc.pre(envCfg.instance_id !== explicitCfg.instance_id);
          fc.pre(envCfg.token !== explicitCfg.token);
          fc.pre(explicitCfg.api_url !== workspaceCfg.api_url);
          fc.pre(explicitCfg.project_id !== workspaceCfg.project_id);

          // --- Arrange: write workspace config ---
          const workDir = join(tmpRoot, `run-${Math.random().toString(36).slice(2)}`);
          const loxtepDir = join(workDir, '.loxtep');
          await mkdir(loxtepDir, { recursive: true });
          await writeFile(
            join(loxtepDir, 'project.json'),
            JSON.stringify(workspaceCfg)
          );

          // Set env vars (highest precedence)
          process.env.LOXTEP_API_URL = envCfg.api_url;
          process.env.LOXTEP_PROJECT_ID = envCfg.project_id;
          process.env.LOXTEP_INSTANCE_ID = envCfg.instance_id;
          process.env.LOXTEP_TOKEN = envCfg.token;

          // --- Act: resolve with all three layers ---
          const result = resolveAutoConfig(explicitCfg, workDir);

          // --- Assert: env vars win over explicit, explicit would win over workspace ---
          expect(result.api_url).toBe(envCfg.api_url);
          expect(result.project_id).toBe(envCfg.project_id);
          expect(result.instance_id).toBe(envCfg.instance_id);
          expect(result.token).toBe(envCfg.token);

          // Clean env for next iteration
          delete process.env.LOXTEP_API_URL;
          delete process.env.LOXTEP_PROJECT_ID;
          delete process.env.LOXTEP_INSTANCE_ID;
          delete process.env.LOXTEP_TOKEN;
        }
      ),
      { numRuns: 100 },
    );
  });

  it('partial explicit config overrides only the supplied fields; workspace fills the rest', async () => {
    await fc.assert(
      fc.asyncProperty(
        workspaceConfigArb,
        apiUrlArb,
        async (workspaceCfg, explicitApiUrl) => {
          // Ensure explicit api_url differs from workspace
          fc.pre(explicitApiUrl !== workspaceCfg.api_url);

          // --- Arrange: write workspace config ---
          const workDir = join(tmpRoot, `run-${Math.random().toString(36).slice(2)}`);
          const loxtepDir = join(workDir, '.loxtep');
          await mkdir(loxtepDir, { recursive: true });
          await writeFile(
            join(loxtepDir, 'project.json'),
            JSON.stringify(workspaceCfg)
          );

          // --- Act: pass only api_url as explicit, leaving other fields unset ---
          const result = resolveAutoConfig({ api_url: explicitApiUrl }, workDir);

          // --- Assert: explicit api_url wins, other fields fall through to workspace ---
          expect(result.api_url).toBe(explicitApiUrl);
          expect(result.project_id).toBe(workspaceCfg.project_id);
          expect(result.instance_id).toBe(workspaceCfg.instance_id);
        }
      ),
      { numRuns: 100 },
    );
  });
});
