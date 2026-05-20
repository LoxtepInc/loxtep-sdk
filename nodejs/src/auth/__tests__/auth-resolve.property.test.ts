import fc from 'fast-check';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolveCliAccessToken } from '../../cli/auth-resolve';

let iterationCounter = 0;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Save original env so we can restore after each test. */
const originalEnv = { ...process.env };

function restoreEnv(): void {
  // Remove any keys we may have added
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  // Restore original values
  Object.assign(process.env, originalEnv);
}

/* ------------------------------------------------------------------ */
/*  Arbitraries                                                       */
/* ------------------------------------------------------------------ */

/**
 * Non-empty, trimmed string suitable for use as a token value.
 * Avoids whitespace-only strings (which would be trimmed to empty by the resolver).
 */
const tokenArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim());

/**
 * Credentials file state:
 * - 'valid': file present with a valid access_token
 * - 'expired': file present with a valid access_token (the resolver does not
 *   check expiry — it returns whatever token is in the file; the caller
 *   handles refresh). We model this as a file with an `expires_at` in the past.
 * - 'absent': no credentials file
 */
type CredsFileState = 'valid' | 'expired' | 'absent';
const credsFileStateArb: fc.Arbitrary<CredsFileState> = fc.constantFrom(
  'valid',
  'expired',
  'absent',
);

/**
 * Env var state:
 * - 'present': LOXTEP_AUTH_TOKEN is set to a non-empty value
 * - 'absent': LOXTEP_AUTH_TOKEN is not set
 */
type EnvVarState = 'present' | 'absent';
const envVarStateArb: fc.Arbitrary<EnvVarState> = fc.constantFrom('present', 'absent');

/* ------------------------------------------------------------------ */
/*  Property 3: Auth token precedence resolution                      */
/* ------------------------------------------------------------------ */

/**
 * Property 3: Auth token precedence resolution
 *
 * For any combination of LOXTEP_AUTH_TOKEN environment variable
 * (present or absent) and ~/.loxtep/credentials.json file (present
 * with valid token, present with expired token, or absent), the SDK
 * auth resolver SHALL return the token from the highest-precedence
 * source: env var first, then credentials file. If neither is
 * available, it SHALL return null.
 *
 * **Validates: Requirements 6.1**
 */
describe('Property 3: Auth token precedence resolution', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth-resolve-pbt-'));
  });

  afterEach(async () => {
    restoreEnv();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolver returns token from highest-precedence source; null if neither available', async () => {
    await fc.assert(
      fc.asyncProperty(
        envVarStateArb,
        credsFileStateArb,
        tokenArb,
        tokenArb,
        async (envState, credsState, envToken, credsToken) => {
          // Use a unique credentials path per iteration to avoid cross-contamination
          const iterDir = join(tempDir, `iter-${iterationCounter++}`);
          const credsPath = join(iterDir, 'credentials.json');

          // --- Arrange: env var ---
          if (envState === 'present') {
            process.env.LOXTEP_AUTH_TOKEN = envToken;
          } else {
            delete process.env.LOXTEP_AUTH_TOKEN;
          }

          // --- Arrange: credentials file ---
          if (credsState === 'valid') {
            const { mkdir } = await import('node:fs/promises');
            await mkdir(iterDir, { recursive: true });
            await writeFile(
              credsPath,
              JSON.stringify({ access_token: credsToken }),
              'utf-8',
            );
          } else if (credsState === 'expired') {
            const { mkdir } = await import('node:fs/promises');
            await mkdir(iterDir, { recursive: true });
            // Write a token with an expires_at in the past.
            // The resolver does NOT check expiry — it returns the token.
            await writeFile(
              credsPath,
              JSON.stringify({
                access_token: credsToken,
                expires_at: '2020-01-01T00:00:00Z',
              }),
              'utf-8',
            );
          }
          // 'absent' — no file written, iterDir not created

          // --- Act ---
          const result = await resolveCliAccessToken({ credentialsPath: credsPath });

          // --- Assert ---
          if (envState === 'present') {
            // Env var takes highest precedence
            expect(result).not.toBeNull();
            expect(result!.access_token).toBe(envToken);
            expect(result!.source).toBe('env');
          } else if (credsState === 'valid' || credsState === 'expired') {
            // Credentials file is next in precedence
            expect(result).not.toBeNull();
            expect(result!.access_token).toBe(credsToken);
            expect(result!.source).toBe('credentials');
          } else {
            // Neither source available → null
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
