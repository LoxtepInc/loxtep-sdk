/**
 * Optional staging smoke tests — run only when LOXTEP_CLI_SMOKE=1 and credentials exist.
 *
 *   LOXTEP_CLI_SMOKE=1 pnpm exec jest src/cli/cli-staging-smoke.test.ts
 */

import { existsSync } from 'node:fs';
import { getDefaultConfigPath, getConfigDir } from '../config/paths.js';
import { getCredentialsPath } from './credentials.js';
import { runWhoami } from './commands/whoami.js';
import { captureCliOutput, expectCliSuccess } from './__tests__/cli-test-harness.js';

const smokeEnabled = process.env.LOXTEP_CLI_SMOKE === '1';
const hasGlobalCreds =
  existsSync(getDefaultConfigPath()) && existsSync(getCredentialsPath());

const describeSmoke = smokeEnabled && hasGlobalCreds ? describe : describe.skip;

describeSmoke('CLI staging smoke (live API)', () => {
  beforeEach(() => {
    delete process.env.LOXTEP_AUTH_TOKEN;
    process.exitCode = 0;
  });

  it('whoami returns user email against configured staging/dev API', async () => {
    const out = captureCliOutput();
    await runWhoami();
    expectCliSuccess(out);
    expect(out.text).not.toMatch(/User:\s*—/);
    out.restore();
  });

  it('documents config directory used for smoke run', () => {
    expect(getConfigDir()).toBeTruthy();
  });
});

if (!smokeEnabled) {
  it('skips staging smoke unless LOXTEP_CLI_SMOKE=1', () => {
    expect(true).toBe(true);
  });
}
