import { parseCurrentUserResponse, unwrapApiEnvelope } from './current-user-response.js';

describe('parseCurrentUserResponse', () => {
  it('unwraps success envelope with nested user and organization (/users/me)', () => {
    const parsed = parseCurrentUserResponse({
      success: true,
      data: {
        user: {
          user_id: 'u1',
          email: 'alice@example.com',
          first_name: 'Alice',
          last_name: 'Example',
          organization_id: 'o1',
        },
        organization: {
          organization_id: 'o1',
          name: 'Acme Corp',
          status: 'active',
        },
      },
    });

    expect(parsed).toEqual({
      user_id: 'u1',
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Example',
      organization_id: 'o1',
      organization_name: 'Acme Corp',
      permissions: undefined,
    });
  });

  it('accepts flat user object without envelope', () => {
    const parsed = parseCurrentUserResponse({
      email: 'bob@example.com',
      first_name: 'Bob',
      organization_name: 'Beta LLC',
    });

    expect(parsed.email).toBe('bob@example.com');
    expect(parsed.organization_name).toBe('Beta LLC');
  });

  it('unwrapApiEnvelope returns inner data when success is true', () => {
    expect(unwrapApiEnvelope({ success: true, data: { ok: true } })).toEqual({ ok: true });
    expect(unwrapApiEnvelope({ email: 'x@y.com' })).toEqual({ email: 'x@y.com' });
  });
});
