import { decodeJwtPayload, DEFAULT_REFRESH_THRESHOLD_SECONDS } from './jwt.js';

describe('decodeJwtPayload', () => {
  it('should decode exp from JWT', () => {
    // header.payload.signature; payload = base64url({ exp: 999 })
    const payload = Buffer.from(JSON.stringify({ exp: 999 }), 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const token = `header.${payload}.sig`;
    expect(decodeJwtPayload(token).exp).toBe(999);
  });

  it('should return empty object for invalid token', () => {
    expect(decodeJwtPayload('')).toEqual({});
    expect(decodeJwtPayload('a.b')).toEqual({});
    expect(decodeJwtPayload('not-a-jwt')).toEqual({});
  });
});

describe('DEFAULT_REFRESH_THRESHOLD_SECONDS', () => {
  it('should be 300', () => {
    expect(DEFAULT_REFRESH_THRESHOLD_SECONDS).toBe(300);
  });
});
