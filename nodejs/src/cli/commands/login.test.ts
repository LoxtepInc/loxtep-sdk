/**
 * Console login + credentials scope writing (mock fetch — no network).
 */

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CONFIG_DIR_ENV } from '../../config/paths.js';
import { getLocalCredentialsPath, getCredentialsPath } from '../credentials.js';
import {
  MOCK_PLATFORM_API,
  createAuthFlowMockFetch,
} from '../__tests__/mock-platform-api.js';
import { captureCliOutput, expectCliSuccess } from '../__tests__/cli-test-harness.js';

const mockBrowserLogin = jest.fn();

jest.mock('../../auth/browser-login.js', () => ({
  browserLogin: (...args: unknown[]) => mockBrowserLogin(...args),
}));

import { runLogin } from './login.js';

describe('runLogin console + scope', () => {
  let root: string;
  let configPath: string;
  const prevConfigDir = process.env[CONFIG_DIR_ENV];

  beforeEach(async () => {
    root = join(tmpdir(), `loxtep-login-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(root, 'project', '.loxtep'), { recursive: true });
    process.env[CONFIG_DIR_ENV] = join(root, 'global-config');
    await mkdir(process.env[CONFIG_DIR_ENV], { recursive: true });
    configPath = join(process.env[CONFIG_DIR_ENV], 'config.json');
    await writeFile(configPath, JSON.stringify({ api_url: MOCK_PLATFORM_API }, null, 2), 'utf-8');
    process.exitCode = 0;
    mockBrowserLogin.mockReset();
  });

  afterEach(async () => {
    process.exitCode = 0;
    if (prevConfigDir === undefined) delete process.env[CONFIG_DIR_ENV];
    else process.env[CONFIG_DIR_ENV] = prevConfigDir;
    if (existsSync(root)) await rm(root, { recursive: true, force: true });
  });

  it('console login writes credentials to explicit path', async () => {
    const credentialsPath = join(root, 'creds.json');
    const out = captureCliOutput();
    await runLogin({
      console: true,
      email: 'flow@test.com',
      password: 'secret',
      mfa_code: '',
      fetchFn: createAuthFlowMockFetch(),
      configFilePath: configPath,
      credentialsPath,
    });
    expectCliSuccess(out, 'Logged in successfully');
    const creds = JSON.parse(await readFile(credentialsPath, 'utf-8')) as {
      access_token?: string;
    };
    expect(creds.access_token).toBe('mock-access-token');
    out.restore();
  });

  it('console login with --local writes under cwd/.loxtep and notes project-local', async () => {
    const cwd = join(root, 'project');
    const out = captureCliOutput();
    await runLogin({
      console: true,
      email: 'local@test.com',
      password: 'secret',
      mfa_code: '',
      fetchFn: createAuthFlowMockFetch(),
      configFilePath: configPath,
      scope: 'local',
      cwd,
    });
    const localPath = getLocalCredentialsPath(cwd);
    expectCliSuccess(out, 'Logged in successfully', '(project-local)');
    expect(existsSync(localPath)).toBe(true);
    expect(out.stdout).toContain(localPath);
    const gitignore = await readFile(join(cwd, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.loxtep/credentials.json');
    out.restore();
  });

  it('console login with --global writes under LOXTEP_CONFIG_DIR', async () => {
    const out = captureCliOutput();
    await runLogin({
      console: true,
      email: 'global@test.com',
      password: 'secret',
      mfa_code: '',
      fetchFn: createAuthFlowMockFetch(),
      configFilePath: configPath,
      scope: 'global',
      cwd: join(root, 'project'),
    });
    const globalPath = getCredentialsPath();
    expect(globalPath).toBe(join(root, 'global-config', 'credentials.json'));
    expectCliSuccess(out, 'Logged in successfully', '(global)');
    expect(existsSync(globalPath)).toBe(true);
    out.restore();
  });

  it('browser login (default) writes tokens via mocked browserLogin', async () => {
    mockBrowserLogin.mockResolvedValue({
      access_token: 'browser-access',
      refresh_token: 'browser-refresh',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      api_base_url: MOCK_PLATFORM_API,
    });
    const credentialsPath = join(root, 'browser-creds.json');
    const out = captureCliOutput();
    await runLogin({
      configFilePath: configPath,
      credentialsPath,
      no_open: true,
    });
    expectCliSuccess(out, 'Logged in successfully');
    expect(mockBrowserLogin).toHaveBeenCalled();
    const creds = JSON.parse(await readFile(credentialsPath, 'utf-8')) as {
      access_token?: string;
    };
    expect(creds.access_token).toBe('browser-access');
    out.restore();
  });

  it('browser login maps apidev → appdev app URL', async () => {
    const devConfig = join(root, 'dev-config.json');
    await writeFile(
      devConfig,
      JSON.stringify({ api_url: 'https://apidev.loxtep.io' }, null, 2),
      'utf-8'
    );
    mockBrowserLogin.mockResolvedValue({
      access_token: 't',
      refresh_token: 'r',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    const out = captureCliOutput();
    await runLogin({
      configFilePath: devConfig,
      credentialsPath: join(root, 'dev-creds.json'),
      no_open: true,
    });
    expect(mockBrowserLogin.mock.calls[0][0]).toEqual(
      expect.objectContaining({ app_url: 'https://appdev.loxtep.io', channel: 'cli' })
    );
    out.restore();
  });

  it('surfaces MFA-required login failure', async () => {
    const mfaFetch = (async () =>
      new Response(JSON.stringify({ error: 'MFA code required', mfaRequired: true }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    const out = captureCliOutput();
    await runLogin({
      console: true,
      email: 'mfa@test.com',
      password: 'secret',
      mfa_code: '',
      fetchFn: mfaFetch,
      configFilePath: configPath,
      credentialsPath: join(root, 'out.json'),
    });
    expect(process.exitCode).toBe(1);
    expect(out.stderr).toContain('requires MFA');
    out.restore();
  });

  it('fails when login API rejects credentials', async () => {
    const badFetch = (async () =>
      new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    const out = captureCliOutput();
    await runLogin({
      console: true,
      email: 'bad@test.com',
      password: 'wrong',
      mfa_code: '',
      fetchFn: badFetch,
      configFilePath: configPath,
      credentialsPath: join(root, 'out.json'),
    });
    expect(process.exitCode).toBe(1);
    expect(out.stderr).toContain('Login failed');
    out.restore();
  });

  it('browser login failure sets exitCode and prints error', async () => {
    mockBrowserLogin.mockRejectedValue(new Error('popup blocked'));
    const out = captureCliOutput();
    await runLogin({
      configFilePath: configPath,
      credentialsPath: join(root, 'fail-creds.json'),
      no_open: true,
    });
    expect(process.exitCode).toBe(1);
    expect(out.stderr).toContain('Login failed:');
    expect(out.stderr).toContain('popup blocked');
    out.restore();
  });

  it('defaults app URL when api_url is not api./apidev.', async () => {
    const oddConfig = join(root, 'odd-config.json');
    await writeFile(oddConfig, JSON.stringify({ api_url: 'https://gateway.internal' }, null, 2));
    mockBrowserLogin.mockResolvedValue({
      access_token: 't',
      refresh_token: 'r',
    });
    const out = captureCliOutput();
    await runLogin({
      configFilePath: oddConfig,
      credentialsPath: join(root, 'odd-creds.json'),
      no_open: true,
    });
    expect(mockBrowserLogin.mock.calls[0][0]).toEqual(
      expect.objectContaining({ app_url: 'https://app.loxtep.io' })
    );
    out.restore();
  });

  it('rejects invalid MFA digit length', async () => {
    const out = captureCliOutput();
    await expect(
      runLogin({
        console: true,
        email: 'mfa@test.com',
        password: 'secret',
        mfa_code: '12',
        fetchFn: createAuthFlowMockFetch(),
        configFilePath: configPath,
        credentialsPath: join(root, 'out.json'),
      })
    ).rejects.toThrow(/6 digits/);
    out.restore();
  });

  it('browser login with local scope gitignores credentials', async () => {
    mockBrowserLogin.mockResolvedValue({
      access_token: 'browser-access',
      refresh_token: 'browser-refresh',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    const cwd = join(root, 'project');
    const out = captureCliOutput();
    await runLogin({
      configFilePath: configPath,
      scope: 'local',
      cwd,
      no_open: true,
    });
    expectCliSuccess(out, 'Logged in successfully', '(project-local)');
    const gitignore = await readFile(join(cwd, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.loxtep/credentials.json');
    out.restore();
  });
});
