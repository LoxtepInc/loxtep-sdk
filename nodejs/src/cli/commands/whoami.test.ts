/**
 * Tests for `loxtep whoami` — fetchUser formatting + HTTP/debug paths.
 */

import {
  createCliTestHarness,
  captureCliOutput,
  expectCliSuccess,
} from '../__tests__/cli-test-harness.js';
import { createPlatformMockFetch } from '../__tests__/mock-platform-api.js';
import { runWhoami } from './whoami.js';

describe('runWhoami', () => {
  const prevDebug = process.env.LOXTEP_DEBUG;

  afterEach(() => {
    process.exitCode = 0;
    if (prevDebug === undefined) delete process.env.LOXTEP_DEBUG;
    else process.env.LOXTEP_DEBUG = prevDebug;
  });

  it('prints user from injected fetchUser', async () => {
    const out = captureCliOutput();
    await runWhoami({
      fetchUser: async () => ({
        user_id: 'u1',
        email: 'a@b.com',
        first_name: 'Ada',
        last_name: 'Lovelace',
        organization_id: 'org-1',
        organization_name: 'Analytical Engines',
      }),
    });
    expectCliSuccess(out, 'User: a@b.com', 'Name: Ada Lovelace', 'Organization: Analytical Engines');
    out.restore();
  });

  it('sets exitCode when profile is a placeholder identity', async () => {
    const out = captureCliOutput();
    await runWhoami({
      fetchUser: async () => ({
        user_id: 'u1',
      }),
    });
    expect(process.exitCode).toBe(1);
    expect(out.stderr).toContain('Could not read your profile');
    out.restore();
  });

  it('surfaces HTTP failures with permission hint', async () => {
    const harness = await createCliTestHarness();
    const fetchFn = createPlatformMockFetch({
      extra: () =>
        new Response(JSON.stringify({ success: false, error: { message: 'Access denied' } }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    try {
      const out = captureCliOutput();
      await runWhoami({ ...harness.cliOptions, fetch_fn: fetchFn });
      expect(process.exitCode).toBe(1);
      expect(out.stderr).toMatch(/Failed to fetch user|Access denied|insufficient permissions/i);
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('fetches /users/me via harness and prints identity', async () => {
    const harness = await createCliTestHarness();
    try {
      const out = captureCliOutput();
      await runWhoami(harness.cliOptions);
      expectCliSuccess(out, 'User:', 'Organization:');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('debug mode logs request URL and response', async () => {
    const harness = await createCliTestHarness();
    process.env.LOXTEP_DEBUG = '1';
    try {
      const out = captureCliOutput();
      await runWhoami({ ...harness.cliOptions, debug: true });
      expect(out.stderr).toContain('[loxtep whoami debug]');
      expect(out.stderr).toContain('/organizations/users/me');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });

  it('exits 1 when api_url/token cannot be resolved', async () => {
    const out = captureCliOutput();
    await runWhoami({
      configFilePath: '/tmp/loxtep-whoami-missing-config.json',
      credentialsPath: '/tmp/loxtep-whoami-missing-creds.json',
    });
    expect(process.exitCode).toBe(1);
    expect(out.stderr).toContain('Missing api_url or access token');
    out.restore();
  });

  it('debug mode notes empty response bodies', async () => {
    const harness = await createCliTestHarness();
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ message: 'OK' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    try {
      const out = captureCliOutput();
      await runWhoami({ ...harness.cliOptions, fetch_fn: fetchFn, debug: true });
      expect(out.stderr).toContain('empty or non-JSON body');
      out.restore();
    } finally {
      await harness.destroy();
    }
  });
});
