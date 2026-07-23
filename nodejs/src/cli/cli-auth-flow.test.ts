/**
 * CLI auth integration tests — full HTTP path with production-shaped API envelopes.
 * Catches bugs like whoami reading flat fields when the API returns { success, data: { user, organization } }.
 */

import { runLogin } from './commands/login.js';
import { runWhoami } from './commands/whoami.js';
import { readCredentials, writeCredentials } from './credentials.js';
import {
  MOCK_PLATFORM_API,
  createAuthFlowMockFetch,
  usersMeSuccessResponse,
  createMockPlatformFetch,
} from './__tests__/mock-platform-api.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CLI auth flow (mock platform API)', () => {
  let configDir: string;
  let configPath: string;
  let credentialsPath: string;

  beforeAll(async () => {
    configDir = join(tmpdir(), `loxtep-cli-auth-${Date.now()}`);
    configPath = join(configDir, 'config.json');
    credentialsPath = join(configDir, 'credentials.json');
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify({ api_url: MOCK_PLATFORM_API }, null, 2), 'utf-8');
  });

  afterAll(async () => {
    if (existsSync(configDir)) await rm(configDir, { recursive: true });
  });

  beforeEach(async () => {
    if (existsSync(credentialsPath)) await rm(credentialsPath);
  });

  it('login then whoami prints user and org from wrapped /users/me response', async () => {
    const mockFetch = createAuthFlowMockFetch();

    await runLogin({
      email: 'flow@test.com',
      password: 'secret',
      mfa_code: '',
      fetchFn: mockFetch,
      configFilePath: configPath,
      credentialsPath,
    });

    const creds = await readCredentials(credentialsPath);
    expect(creds?.access_token).toBe('mock-access-token');

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await runWhoami({
      credentialsPath,
      configFilePath: configPath,
      fetchFn: mockFetch,
    });

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('cli-user@test.loxtep.com');
    expect(output).toContain('CLI User');
    expect(output).toContain('Test Organization');
    logSpy.mockRestore();
  });

  it('whoami fails visibly when /users/me returns success envelope but empty nested user', async () => {
    await writeCredentials(
      {
        access_token: 'mock-token',
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        api_base_url: MOCK_PLATFORM_API,
      },
      credentialsPath
    );

    const mockFetch = createMockPlatformFetch(
      new Map([
        [
          '/organizations/users/me',
          () =>
            new Response(
              JSON.stringify({
                success: true,
                data: { user: {}, organization: {} },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            ),
        ],
      ])
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await runWhoami({
      credentialsPath,
      configFilePath: configPath,
      fetchFn: mockFetch,
    });

    const output = logSpy.mock.calls
      .map(call => call.map(String).join(' '))
      .join('\n');
    expect(output).toMatch(/User:\s*—/);
    logSpy.mockRestore();
  });

  it('uses canonical users/me fixture shape documented in mock-platform-api', () => {
    const body = usersMeSuccessResponse();
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          user: expect.objectContaining({ email: expect.any(String) }),
          organization: expect.objectContaining({ name: expect.any(String) }),
        }),
      })
    );
  });
});
