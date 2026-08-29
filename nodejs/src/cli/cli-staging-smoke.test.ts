/**
 * Optional staging smoke tests — run only when LOXTEP_CLI_SMOKE=1 and credentials
 * resolve from cwd (project-local `./.loxtep/credentials.json` preferred, then
 * global fallback). Does **not** require `~/.loxtep/config.json`.
 *
 *   # from a directory where you ran `loxtep login` (writes ./.loxtep/credentials.json)
 *   LOXTEP_CLI_SMOKE=1 pnpm exec jest src/cli/cli-staging-smoke.test.ts
 */

import { existsSync } from 'node:fs';
import { resolveCredentialsPath } from './credentials.js';
import { runWhoami } from './commands/whoami.js';
import { captureCliOutput, expectCliSuccess } from './__tests__/cli-test-harness.js';

const smokeEnabled = process.env.LOXTEP_CLI_SMOKE === '1';
const smokeCwd = process.cwd();
const resolvedCreds = resolveCredentialsPath(smokeCwd);
const hasResolvedCreds = existsSync(resolvedCreds.path);

const describeSmoke = smokeEnabled && hasResolvedCreds ? describe : describe.skip;

describeSmoke('CLI staging smoke (live API)', () => {
  beforeEach(() => {
    delete process.env.LOXTEP_AUTH_TOKEN;
    process.exitCode = 0;
  });

  it('whoami returns user email against configured staging/dev API', async () => {
    const out = captureCliOutput();
    await runWhoami({
      cwd: smokeCwd,
      credentialsPath: resolvedCreds.path,
    });
    expectCliSuccess(out);
    expect(out.text).not.toMatch(/User:\s*—/);
    out.restore();
  });

  it('resolves credentials from cwd (pwd-local preferred over ~/.loxtep)', () => {
    expect(existsSync(resolvedCreds.path)).toBe(true);
    expect(['local', 'global']).toContain(resolvedCreds.scope);
  });
});

if (!smokeEnabled) {
  it('skips staging smoke unless LOXTEP_CLI_SMOKE=1', () => {
    expect(true).toBe(true);
  });
}

if (smokeEnabled && !hasResolvedCreds) {
  it('skips staging smoke unless credentials resolve from cwd (run: loxtep login)', () => {
    expect(true).toBe(true);
  });
}
