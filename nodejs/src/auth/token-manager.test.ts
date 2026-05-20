import { TokenManager } from './token-manager.js';
import { DEFAULT_REFRESH_THRESHOLD_SECONDS } from './jwt.js';

describe('TokenManager', () => {
  let manager: TokenManager;

  beforeEach(() => {
    manager = new TokenManager();
  });

  it('should set and get token', () => {
    manager.setToken('access-1');
    expect(manager.getToken()).toBe('access-1');
    expect(manager.getRefreshToken()).toBeNull();
  });

  it('should set refresh token and expires_at', () => {
    manager.setToken('access-1', 'refresh-1', 12345);
    expect(manager.getToken()).toBe('access-1');
    expect(manager.getRefreshToken()).toBe('refresh-1');
  });

  it('should clear tokens', () => {
    manager.setToken('access-1', 'refresh-1');
    manager.clear();
    expect(manager.getToken()).toBeNull();
    expect(manager.getRefreshToken()).toBeNull();
  });

  it('should return null when no token', () => {
    expect(manager.getToken()).toBeNull();
  });

  it('shouldRefresh should return true when no token', () => {
    expect(manager.shouldRefresh(DEFAULT_REFRESH_THRESHOLD_SECONDS)).toBe(true);
  });

  it('getTokenOrRefresh should call refreshFn when shouldRefresh and refresh_token exists', async () => {
    const expFar = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ exp: expFar }), 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const token = `h.${payload}.s`;
    manager.setToken(token, 'refresh-1');
    const refreshFn = jest.fn().mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
    });
    const result = await manager.getTokenOrRefresh('https://api.example.com', 9999, refreshFn);
    expect(refreshFn).toHaveBeenCalledWith('https://api.example.com', 'refresh-1');
    expect(result).toBe('new-access');
    expect(manager.getToken()).toBe('new-access');
    expect(manager.getRefreshToken()).toBe('new-refresh');
  });

  it('getTokenOrRefresh should return current token when refresh fails', async () => {
    const expFar = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ exp: expFar }), 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const token = `h.${payload}.s`;
    manager.setToken(token, 'refresh-1');
    const refreshFn = jest.fn().mockRejectedValue(new Error('Network error'));
    const result = await manager.getTokenOrRefresh('https://api.example.com', 9999, refreshFn);
    expect(result).toBe(token);
    expect(manager.getToken()).toBe(token);
  });
});
