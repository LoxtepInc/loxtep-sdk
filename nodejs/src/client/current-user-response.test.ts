import {
  mergeJwtIdentityFallback,
  parseCurrentUserResponse,
  unwrapApiEnvelope,
} from './current-user-response.js';

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

  it('unwraps double-nested success envelopes', () => {
    const parsed = parseCurrentUserResponse({
      success: true,
      data: {
        success: true,
        data: {
          user: { email: 'double@example.com', first_name: 'Double' },
          organization: { name: 'Nested Org' },
        },
      },
    });

    expect(parsed.email).toBe('double@example.com');
    expect(parsed.first_name).toBe('Double');
    expect(parsed.organization_name).toBe('Nested Org');
  });

  it('accepts camelCase user and organization fields', () => {
    const parsed = parseCurrentUserResponse({
      success: true,
      data: {
        user: {
          userId: 'u-camel',
          email: 'camel@example.com',
          firstName: 'Cam',
          lastName: 'ElCase',
        },
        organization: {
          organizationId: 'org-camel',
          name: 'Camel Org',
        },
      },
    });

    expect(parsed).toMatchObject({
      user_id: 'u-camel',
      email: 'camel@example.com',
      first_name: 'Cam',
      last_name: 'ElCase',
      organization_id: 'org-camel',
      organization_name: 'Camel Org',
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

describe('mergeJwtIdentityFallback', () => {
  it('fills email and org from JWT claims when API body is empty', () => {
    const merged = mergeJwtIdentityFallback(
      {},
      {
        sub: 'jwt-sub',
        email: 'jwt@example.com',
        given_name: 'Jwt',
        family_name: 'User',
        organization_id: 'org-jwt',
        organization_name: 'JWT Org',
      }
    );

    expect(merged).toMatchObject({
      user_id: 'jwt-sub',
      email: 'jwt@example.com',
      first_name: 'Jwt',
      last_name: 'User',
      organization_id: 'org-jwt',
      organization_name: 'JWT Org',
    });
  });
});
