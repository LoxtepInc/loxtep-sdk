import fc from 'fast-check';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { loadConfig } from '../load';
import { saveConfig } from '../save';
import type { LoxtepConfig } from '../types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Env vars that loadConfig reads — we clear them during the test. */
const CONFIG_ENV_VARS = [
  'LOXTEP_API_URL',
  'LOXTEP_AUTH_PATH_PREFIX',
  'LOXTEP_API_PATH_PREFIX',
  'LOXTEP_ORGANIZATION_ID',
  'LOXTEP_PROJECT_ID',
  'LOXTEP_INSTANCE_ID',
  'LOXTEP_REGION',
  'LOXTEP_RSTREAMS_CONFIG_FILE',
] as const;

const originalEnv: Record<string, string | undefined> = {};

function clearConfigEnvVars(): void {
  for (const key of CONFIG_ENV_VARS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreConfigEnvVars(): void {
  for (const key of CONFIG_ENV_VARS) {
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
 * Non-empty string safe for JSON round-trip (no control chars that
 * would be mangled by JSON.stringify/parse).
 */
const safeNonEmptyString = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim());

/**
 * Optional non-empty string (undefined when absent).
 */
const optionalString = fc.option(safeNonEmptyString, { nil: undefined });

/**
 * Arbitrary that produces valid LoxtepConfig objects.
 *
 * We test the core scalar fields that saveConfig writes and loadConfig reads.
 * The `streams` field is excluded because saveConfig only writes it when
 * non-empty, and the round-trip for streams involves PascalCase key parsing
 * via parseStreamsPartial — which is a separate concern. The property focuses
 * on the primary config fields per Requirement 6.4.
 */
const loxtepConfigArb: fc.Arbitrary<LoxtepConfig> = fc.record(
  {
    api_url: safeNonEmptyString,
    auth_path_prefix: optionalString,
    api_path_prefix: optionalString,
    organization_id: optionalString,
    project_id: optionalString,
    instance_id: optionalString,
    region: optionalString,
  },
  { requiredKeys: ['api_url'] },
);

/* ------------------------------------------------------------------ */
/*  Property 4: Config file loading round-trip                        */
/* ------------------------------------------------------------------ */

/**
 * Property 4: Config file loading round-trip
 *
 * For any valid LoxtepConfig object, saving it to a config file via
 * saveConfig() and then loading it via loadConfig() (with no env var
 * overrides) SHALL produce a config equivalent to the original.
 *
 * **Validates: Requirements 6.4**
 */
describe('Property 4: Config file loading round-trip', () => {
  let tempDir: string;
  let iterationCounter = 0;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'config-load-pbt-'));
    clearConfigEnvVars();
  });

  afterEach(async () => {
    restoreConfigEnvVars();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('loadConfig(saveConfig(config)) equals original config (no env overrides)', async () => {
    await fc.assert(
      fc.asyncProperty(loxtepConfigArb, async (config) => {
        // Use a unique file per iteration to avoid cross-contamination
        const configPath = join(tempDir, `config-${iterationCounter++}.json`);

        // --- Arrange: save config ---
        await saveConfig(config, configPath);

        // --- Act: load config back ---
        const loaded = await loadConfig(configPath);

        // --- Assert: loaded config matches original ---
        // api_url: always present
        expect(loaded.api_url).toBe(config.api_url);

        // Optional string fields: present in loaded iff present in original.
        // When undefined in the original, saveConfig writes the key with value
        // undefined which JSON.stringify omits, so loadConfig returns undefined.
        expect(loaded.auth_path_prefix).toBe(config.auth_path_prefix);
        expect(loaded.api_path_prefix).toBe(config.api_path_prefix);
        expect(loaded.organization_id).toBe(config.organization_id);
        expect(loaded.project_id).toBe(config.project_id);
        expect(loaded.instance_id).toBe(config.instance_id);
        expect(loaded.region).toBe(config.region);
      }),
      { numRuns: 100 },
    );
  });
});
