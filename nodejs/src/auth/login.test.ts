import { login, refresh, LoginMfaRequiredError } from './login.js';

describe('login', () => {
  it('should return tokens when mock returns success', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            expires_at: '2025-01-01T00:00:00Z',
          },
        }),
    });
    const result = await login('https://api.example.com', 'u@e.com', 'pass', { fetchFn });
    expect(result.access_token).toBe('at');
    expect(result.refresh_token).toBe('rt');
    expect(result.expires_in).toBe(3600);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/app/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'u@e.com', password: 'pass', client_channel: 'sdk_node' }),
      })
    );
  });

  it('should pass through aws_credentials from login data', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            expires_at: '2025-01-01T00:00:00Z',
            aws_credentials: {
              access_key_id: 'AKIA',
              secret_access_key: 'sk',
              session_token: 'st',
              expiration: '2025-01-01T01:00:00Z',
            },
          },
        }),
    });
    const result = await login('https://api.example.com', 'u@e.com', 'pass', { fetchFn });
    expect(result.aws_credentials?.access_key_id).toBe('AKIA');
  });

  it('should throw when response not ok', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: { message: 'Invalid credentials' } }),
    });
    await expect(login('https://api.example.com', 'u@e.com', 'pass', { fetchFn })).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('should throw LoginMfaRequiredError when API returns 403 with mfaRequired', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ error: 'MFA code required', mfaRequired: true }),
    });
    await expect(
      login('https://api.example.com', 'u@e.com', 'pass', { fetchFn })
    ).rejects.toBeInstanceOf(LoginMfaRequiredError);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/app/auth/login',
      expect.objectContaining({
        body: JSON.stringify({ email: 'u@e.com', password: 'pass', client_channel: 'sdk_node' }),
      })
    );
  });

  it('should throw LoginMfaRequiredError for platform error.details.mfaRequired (web-wrapper shape)', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () =>
        Promise.resolve({
          success: false,
          error: {
            message: 'MFA code required',
            details: { mfaRequired: true },
          },
        }),
    });
    await expect(
      login('https://api.example.com', 'u@e.com', 'pass', { fetchFn })
    ).rejects.toBeInstanceOf(LoginMfaRequiredError);
  });

  it('should include URL and cause when fetch throws (network error)', async () => {
    const err = new TypeError('fetch failed') as TypeError & { cause?: Error };
    err.cause = new Error('getaddrinfo ENOTFOUND apidev.example.com');
    const fetchFn = jest.fn().mockRejectedValue(err);
    await expect(
      login('https://apidev.example.com', 'u@e.com', 'pass', { fetchFn })
    ).rejects.toThrow(/POST https:\/\/apidev\.example\.com\/app\/auth\/login failed:.*getaddrinfo/);
  });

  it('should skip auth path segment when auth_path_prefix is empty string', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { access_token: 'at', expires_in: 3600, expires_at: '2025-01-01T00:00:00Z' },
        }),
    });
    await login('https://api.example.com', 'a@b.c', 'pass', { fetchFn, auth_path_prefix: '' });
    expect(fetchFn).toHaveBeenCalledWith('https://api.example.com/auth/login', expect.any(Object));
  });

  it('should not duplicate /app when api_url already ends with /app', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { access_token: 'at', expires_in: 3600, expires_at: '2025-01-01T00:00:00Z' },
        }),
    });
    await login('https://api.example.com/app', 'a@b.c', 'pass', { fetchFn });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/app/auth/login',
      expect.any(Object)
    );
  });

  it('should pass mfa_code in body when provided', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            expires_at: '2025-01-01T00:00:00Z',
          },
        }),
    });
    const result = await login('https://api.example.com', 'u@e.com', 'pass', {
      fetchFn,
      mfa_code: '123456',
    });
    expect(result.access_token).toBe('at');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/app/auth/login',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'u@e.com',
          password: 'pass',
          client_channel: 'sdk_node',
          mfa_code: '123456',
        }),
      })
    );
  });
});

describe('refresh', () => {
  it('should return new tokens when mock returns success', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          access_token: 'new-at',
          refresh_token: 'new-rt',
          expires_in: 3600,
          expires_at: '2025-01-01T00:00:00Z',
        }),
    });
    const result = await refresh('https://api.example.com', 'old-rt', { fetchFn });
    expect(result.access_token).toBe('new-at');
    expect(result.refresh_token).toBe('new-rt');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/app/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'old-rt' }),
      })
    );
  });

  it('should unwrap data and parse aws_credentials when present', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            access_token: 'new-at',
            refresh_token: 'new-rt',
            expires_in: 3600,
            expires_at: '2025-01-01T00:00:00Z',
            aws_credentials: {
              access_key_id: 'AKIA',
              secret_access_key: 'secret',
              session_token: 'token',
              expiration: '2025-01-01T01:00:00Z',
            },
          },
        }),
    });
    const result = await refresh('https://api.example.com', 'old-rt', { fetchFn });
    expect(result.aws_credentials?.access_key_id).toBe('AKIA');
    expect(result.aws_credentials?.session_token).toBe('token');
  });
});
