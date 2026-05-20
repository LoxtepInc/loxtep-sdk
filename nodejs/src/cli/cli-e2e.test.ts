/**
 * CLI E2E tests with mock API (login, whoami). No real network.
 */

import { runLogin } from './commands/login.js';
import { runWhoami } from './commands/whoami.js';
import { writeCredentials, readCredentials } from './credentials.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_API = 'https://api.test.loxtep.com';

function createMockFetch(responses: Map<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = url.replace(TEST_API, '');
    const handler = responses.get(key) ?? responses.get('*');
    if (handler) return handler();
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  }) as typeof fetch;
}

describe('CLI E2E (mock API)', () => {
  let configDir: string;
  let configPath: string;
  let credentialsPath: string;

  beforeAll(async () => {
    configDir = join(tmpdir(), `loxtep-cli-e2e-${Date.now()}`);
    configPath = join(configDir, 'config.json');
    credentialsPath = join(configDir, 'credentials.json');
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify({ api_url: TEST_API }, null, 2), 'utf-8');
  });

  afterAll(async () => {
    if (existsSync(configDir)) await rm(configDir, { recursive: true });
  });

  beforeEach(async () => {
    if (existsSync(credentialsPath)) await rm(credentialsPath);
  });

  it('login with mock API writes credentials', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          '/app/auth/login',
          () =>
            new Response(
              JSON.stringify({
                success: true,
                data: {
                  access_token: 'mock-access-token',
                  refresh_token: 'mock-refresh-token',
                  expires_in: 3600,
                  expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            ),
        ],
      ])
    );

    await runLogin({
      email: 'e2e@test.com',
      password: 'secret',
      mfa_code: '',
      fetchFn: mockFetch,
      configFilePath: configPath,
      credentialsPath,
    });

    const creds = await readCredentials(credentialsPath);
    expect(creds).not.toBeNull();
    expect(creds?.access_token).toBe('mock-access-token');
  });

  it('whoami with mock API prints user and org', async () => {
    await writeCredentials(
      { access_token: 'mock-token', expires_at: new Date(Date.now() + 3600 * 1000).toISOString() },
      credentialsPath
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await runWhoami({
      credentialsPath,
      configFilePath: configPath,
      fetchUser: async () => ({
        email: 'whoami@test.com',
        first_name: 'Who',
        last_name: 'Ami',
        organization_name: 'Test Org',
      }),
    });

    const calls = logSpy.mock.calls.flat().join(' ');
    expect(calls).toContain('whoami@test.com');
    expect(calls).toContain('Test Org');
    logSpy.mockRestore();
  });
});
