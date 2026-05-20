import fc from 'fast-check';
import {
  formatSdkConfigAsJson,
  formatSdkConfigAsEnv,
  type SdkConfig,
} from '../commands/config-cmd';

/* ------------------------------------------------------------------ */
/*  Arbitrary: valid SdkConfig objects                                */
/* ------------------------------------------------------------------ */

/**
 * Generates non-empty strings that are safe for env-var values
 * (no newlines, which would break line-based .env parsing).
 */
const safeNonEmptyString = fc
  .string({ minLength: 1 })
  .filter(s => !s.includes('\n') && !s.includes('\r'));

/**
 * Arbitrary that produces valid SdkConfig objects with required fields
 * and optional project_id, instance_id, region.
 */
const sdkConfigArb: fc.Arbitrary<SdkConfig> = fc.record(
  {
    api_url: safeNonEmptyString,
    organization_id: safeNonEmptyString,
    project_id: fc.option(safeNonEmptyString, { nil: undefined }),
    instance_id: fc.option(safeNonEmptyString, { nil: undefined }),
    region: fc.option(safeNonEmptyString, { nil: undefined }),
  },
  { requiredKeys: ['api_url', 'organization_id'] },
);

/* ------------------------------------------------------------------ */
/*  Property 1: Config export JSON round-trip                         */
/* ------------------------------------------------------------------ */

/**
 * Property 1: Config export JSON round-trip
 *
 * For any valid sdk_config object (containing api_url, organization_id,
 * and optional project_id, instance_id, region), formatting it as JSON
 * via formatSdkConfigAsJson and then parsing the output back SHALL
 * produce an object equivalent to the original sdk_config.
 *
 * **Validates: Requirements 5.2**
 */
describe('Property 1: Config export JSON round-trip', () => {
  it('JSON.parse(formatSdkConfigAsJson(config)) equals original config', () => {
    fc.assert(
      fc.property(sdkConfigArb, (config) => {
        const jsonOutput = formatSdkConfigAsJson(config);
        const parsed = JSON.parse(jsonOutput);

        // Required fields must always be present and match
        expect(parsed.api_url).toBe(config.api_url);
        expect(parsed.organization_id).toBe(config.organization_id);

        // Optional fields: present in output iff present in input
        if (config.project_id !== undefined) {
          expect(parsed.project_id).toBe(config.project_id);
        } else {
          expect(parsed).not.toHaveProperty('project_id');
        }

        if (config.instance_id !== undefined) {
          expect(parsed.instance_id).toBe(config.instance_id);
        } else {
          expect(parsed).not.toHaveProperty('instance_id');
        }

        if (config.region !== undefined) {
          expect(parsed.region).toBe(config.region);
        } else {
          expect(parsed).not.toHaveProperty('region');
        }

        // Build the expected object (only defined keys)
        const expected: Record<string, string> = {
          api_url: config.api_url,
          organization_id: config.organization_id,
        };
        if (config.project_id !== undefined) expected.project_id = config.project_id;
        if (config.instance_id !== undefined) expected.instance_id = config.instance_id;
        if (config.region !== undefined) expected.region = config.region;

        expect(parsed).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Property 2: Config export .env round-trip                         */
/* ------------------------------------------------------------------ */

/**
 * Env-var name → SdkConfig field name mapping.
 */
const ENV_TO_FIELD: Record<string, keyof SdkConfig> = {
  LOXTEP_API_URL: 'api_url',
  LOXTEP_ORGANIZATION_ID: 'organization_id',
  LOXTEP_PROJECT_ID: 'project_id',
  LOXTEP_INSTANCE_ID: 'instance_id',
  LOXTEP_REGION: 'region',
};

/**
 * Parse a .env-formatted string back into an SdkConfig-shaped object.
 * Each line is split on the first '=' sign; the key is mapped from
 * LOXTEP_* env-var name to the corresponding SdkConfig field name.
 */
function parseEnvToSdkConfig(envStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of envStr.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const envKey = line.slice(0, eqIdx);
    const value = line.slice(eqIdx + 1);
    const fieldName = ENV_TO_FIELD[envKey];
    if (fieldName) {
      result[fieldName] = value;
    }
  }
  return result;
}

/**
 * Property 2: Config export .env round-trip
 *
 * For any valid sdk_config object, formatting it as .env via
 * formatSdkConfigAsEnv and then parsing the .env output (splitting
 * on '=', mapping env var names back to SdkConfig field names) SHALL
 * produce key-value pairs that match the original sdk_config fields.
 *
 * **Validates: Requirements 5.3**
 */
describe('Property 2: Config export .env round-trip', () => {
  it('parseEnv(formatSdkConfigAsEnv(config)) equals original config', () => {
    fc.assert(
      fc.property(sdkConfigArb, (config) => {
        const envOutput = formatSdkConfigAsEnv(config);
        const parsed = parseEnvToSdkConfig(envOutput);

        // Required fields must always be present and match
        expect(parsed.api_url).toBe(config.api_url);
        expect(parsed.organization_id).toBe(config.organization_id);

        // Optional fields: present in output iff present in input
        if (config.project_id !== undefined) {
          expect(parsed.project_id).toBe(config.project_id);
        } else {
          expect(parsed).not.toHaveProperty('project_id');
        }

        if (config.instance_id !== undefined) {
          expect(parsed.instance_id).toBe(config.instance_id);
        } else {
          expect(parsed).not.toHaveProperty('instance_id');
        }

        if (config.region !== undefined) {
          expect(parsed.region).toBe(config.region);
        } else {
          expect(parsed).not.toHaveProperty('region');
        }

        // Build the expected object (only defined keys)
        const expected: Record<string, string> = {
          api_url: config.api_url,
          organization_id: config.organization_id,
        };
        if (config.project_id !== undefined) expected.project_id = config.project_id;
        if (config.instance_id !== undefined) expected.instance_id = config.instance_id;
        if (config.region !== undefined) expected.region = config.region;

        expect(parsed).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});
