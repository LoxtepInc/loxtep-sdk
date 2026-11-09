import { exchangeDeployToken } from './deploy-token.js';

const PROJ = '33333333-3333-4333-8333-333333333333';

describe('exchangeDeployToken', () => {
  it('POSTs the token + project to /organizations/auth/deploy-token and returns the access token', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { access_token: 'minted.jwt', expires_in: 900 },
        }),
    });
    const r = await exchangeDeployToken('https://apidev.loxtep.io', 'lxdt_abc', PROJ, { fetchFn });
    expect(r.access_token).toBe('minted.jwt');
    expect(r.expires_in).toBe(900);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://apidev.loxtep.io/organizations/auth/deploy-token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer lxdt_abc',
        }),
        body: JSON.stringify({ project_id: PROJ }),
      })
    );
  });

  it('passes aws_credentials through (option 1 — STS for SigV4)', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            access_token: 'minted.jwt',
            expires_in: 900,
            aws_credentials: {
              access_key_id: 'AKIA',
              secret_access_key: 'sk',
              session_token: 'st',
              expiration: '2099-01-01T00:00:00Z',
            },
          },
        }),
    });
    const r = await exchangeDeployToken('https://apidev.loxtep.io', 'lxdt_abc', PROJ, { fetchFn });
    expect(r.aws_credentials?.access_key_id).toBe('AKIA');
    expect(r.aws_credentials?.session_token).toBe('st');
  });

  it('sends x-loxtep-actor when an actor is given', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'j', expires_in: 900 }),
    });
    await exchangeDeployToken('https://apidev.loxtep.io', 'lxdt_abc', PROJ, {
      fetchFn,
      actor: 'ci-bot@pr-42',
    });
    const headers = fetchFn.mock.calls[0][1].headers;
    expect(headers['x-loxtep-actor']).toBe('ci-bot@pr-42');
  });

  it('throws on a non-ok response', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'Invalid deploy token' }),
    });
    await expect(
      exchangeDeployToken('https://apidev.loxtep.io', 'lxdt_bad', PROJ, { fetchFn })
    ).rejects.toThrow('Invalid deploy token');
  });

  it('accepts a flat (non-enveloped) response shape', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'flat.jwt', expires_in: 900 }),
    });
    const r = await exchangeDeployToken('https://apidev.loxtep.io', 'lxdt_abc', PROJ, { fetchFn });
    expect(r.access_token).toBe('flat.jwt');
  });
});
