import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createCliAuthContext,
  createCliClient,
  createCliHttpClient,
  requireCliClient,
  resolveCliSigV4Credentials,
} from './create-cli-client.js';
import { refresh as refreshAuth } from '../auth/login.js';
import { AuthenticationError } from '../errors/auth.js';
import { waitForUpdateCheck } from './update-notifier.js';

jest.mock('../auth/login.js', () => {
  const actual = jest.requireActual('../auth/login.js');
  return {
    ...actual,
    refresh: jest.fn(),
  };
});

jest.mock('./update-notifier.js', () => ({
  waitForUpdateCheck: jest.fn(async () => undefined),
}));

function makeJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url');
  return `${header}.${payload}.sig`;
}

describe('createCliAuthContext refresh persistence', () => {
  let tempDir: string;
  let configPath: string;
  let credentialsPath: string;

  beforeEach(async () => {
    delete process.env.LOXTEP_AUTH_TOKEN;
    tempDir = await mkdtemp(join(tmpdir(), 'sdk-auth-refresh-test-'));
    configPath = join(tempDir, 'config.json');
    credentialsPath = join(tempDir, 'credentials.json');
    await writeFile(
      configPath,
      JSON.stringify({ api_url: 'https://api.example.com' }, null, 2),
      'utf-8'
    );
  });

  afterEach(async () => {
    delete process.env.LOXTEP_AUTH_TOKEN;
    jest.clearAllMocks();
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('refresh_auth persists rotated refresh token to credentials.json', async () => {
    await writeFile(
      credentialsPath,
      JSON.stringify(
        {
          access_token: makeJwt(Math.floor(Date.now() / 1000) + 10),
          refresh_token: 'old-refresh',
          api_base_url: 'https://api.example.com',
        },
        null,
        2
      ),
      'utf-8'
    );

    jest.mocked(refreshAuth).mockResolvedValue({
      access_token: makeJwt(Math.floor(Date.now() / 1000) + 7200),
      refresh_token: 'rotated-refresh',
      expires_at: new Date(Date.now() + 7200_000).toISOString(),
      expires_in: 7200,
    });

    const auth = await createCliAuthContext({ configFilePath: configPath, credentialsPath });
    expect(auth).not.toBeNull();

    const refreshed = await auth!.refresh_auth();
    expect(refreshed).toBe(true);

    const persisted = JSON.parse(await readFile(credentialsPath, 'utf-8')) as {
      refresh_token?: string;
    };
    expect(persisted.refresh_token).toBe('rotated-refresh');
  });

  it('resolveCliSigV4Credentials throws when STS is expired and refresh fails', async () => {
    await writeFile(
      credentialsPath,
      JSON.stringify(
        {
          access_token: makeJwt(Math.floor(Date.now() / 1000) - 60),
          refresh_token: 'dead-refresh',
          api_base_url: 'https://api.example.com',
          aws_credentials: {
            access_key_id: 'ASIAOLD',
            secret_access_key: 'secret',
            session_token: 'token',
            expiration: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    jest.mocked(refreshAuth).mockRejectedValue(new Error('Session expired or revoked'));

    await expect(
      resolveCliSigV4Credentials({ configFilePath: configPath, credentialsPath })
    ).rejects.toBeInstanceOf(AuthenticationError);

    await expect(
      resolveCliSigV4Credentials({ configFilePath: configPath, credentialsPath })
    ).rejects.toThrow(/could not be refreshed/);
  });

  it('resolveCliSigV4Credentials refreshes expired STS and returns new keys', async () => {
    await writeFile(
      credentialsPath,
      JSON.stringify(
        {
          access_token: makeJwt(Math.floor(Date.now() / 1000) - 60),
          refresh_token: 'old-refresh',
          api_base_url: 'https://api.example.com',
          aws_credentials: {
            access_key_id: 'ASIAOLD',
            secret_access_key: 'old-secret',
            session_token: 'old-token',
            expiration: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    jest.mocked(refreshAuth).mockResolvedValue({
      access_token: makeJwt(Math.floor(Date.now() / 1000) + 7200),
      refresh_token: 'new-refresh',
      expires_at: new Date(Date.now() + 7200_000).toISOString(),
      expires_in: 7200,
      aws_credentials: {
        access_key_id: 'ASIANEW',
        secret_access_key: 'new-secret',
        session_token: 'new-token',
        expiration: new Date(Date.now() + 3600_000).toISOString(),
      },
    });

    const creds = await resolveCliSigV4Credentials({
      configFilePath: configPath,
      credentialsPath,
    });
    expect(creds.accessKeyId).toBe('ASIANEW');
    expect(creds.sessionToken).toBe('new-token');
  });

  it('createCliAuthContext returns null without api_url/token', async () => {
    await writeFile(configPath, JSON.stringify({}, null, 2));
    const auth = await createCliAuthContext({ configFilePath: configPath, credentialsPath });
    expect(auth).toBeNull();
  });

  it('get_token from env source returns token without refresh', async () => {
    process.env.LOXTEP_AUTH_TOKEN = makeJwt(Math.floor(Date.now() / 1000) + 7200);
    const auth = await createCliAuthContext({ configFilePath: configPath, credentialsPath });
    expect(auth).not.toBeNull();
    const tok = await auth!.get_token();
    expect(tok).toBe(process.env.LOXTEP_AUTH_TOKEN);
    expect(await auth!.refresh_auth()).toBe(false);
  });

  it('createCliHttpClient returns null when auth context is missing', async () => {
    await writeFile(configPath, JSON.stringify({}, null, 2));
    const http = await createCliHttpClient({ configFilePath: configPath, credentialsPath });
    expect(http).toBeNull();
  });

  it('createCliClient returns client when credentials are present', async () => {
    await writeFile(
      credentialsPath,
      JSON.stringify(
        {
          access_token: makeJwt(Math.floor(Date.now() / 1000) + 7200),
          refresh_token: 'rt',
          api_base_url: 'https://api.example.com',
        },
        null,
        2
      )
    );
    const result = await createCliClient({ configFilePath: configPath, credentialsPath });
    expect(result).not.toBeNull();
    expect(result!.client.api_url).toContain('api.example.com');
  });

  it('requireCliClient exits when credentials are missing', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await writeFile(configPath, JSON.stringify({}, null, 2));
    await requireCliClient({ configFilePath: configPath, credentialsPath });
    expect(waitForUpdateCheck).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Missing api_url'));
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('requireCliClient exits on AuthenticationError', async () => {
    await writeFile(
      credentialsPath,
      JSON.stringify(
        {
          access_token: makeJwt(Math.floor(Date.now() / 1000) - 60),
          refresh_token: 'dead',
          api_base_url: 'https://api.example.com',
          aws_credentials: {
            access_key_id: 'ASIAOLD',
            secret_access_key: 'secret',
            session_token: 'token',
            expiration: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        null,
        2
      )
    );
    jest.mocked(refreshAuth).mockRejectedValue(new Error('revoked'));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await requireCliClient({ configFilePath: configPath, credentialsPath });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(waitForUpdateCheck).toHaveBeenCalled();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('get_token throws when refresh cannot renew an expired session', async () => {
    await writeFile(
      credentialsPath,
      JSON.stringify(
        {
          access_token: makeJwt(Math.floor(Date.now() / 1000) - 60),
          refresh_token: 'dead-refresh',
          api_base_url: 'https://api.example.com',
        },
        null,
        2
      )
    );
    jest.mocked(refreshAuth).mockRejectedValue(new Error('revoked'));
    const auth = await createCliAuthContext({ configFilePath: configPath, credentialsPath });
    expect(auth).not.toBeNull();
    await expect(auth!.get_token()).rejects.toBeInstanceOf(AuthenticationError);
  });
});
