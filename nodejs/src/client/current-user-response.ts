/**
 * Normalize GET /organizations/users/me — API returns `{ success, data: { user, organization } }`
 * for `user_id=me`, or `{ success, data: User }` for other ids. Some gateways may double-wrap
 * `{ success, data }` or emit camelCase keys (frontend axios converts; raw SDK fetch does not).
 */

export interface ParsedCurrentUser {
  user_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  organization_id?: string;
  organization_name?: string;
  permissions?: string[];
  [key: string]: unknown;
}

const MAX_ENVELOPE_DEPTH = 6;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function isSuccessFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

function pickStr(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = str(record[key]);
    if (v) return v;
  }
  return undefined;
}

function parseEmbeddedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

/** Unwrap nested `{ success, data }` envelopes until a payload or max depth. */
export function unwrapApiEnvelope(raw: unknown, depth = 0): unknown {
  if (depth >= MAX_ENVELOPE_DEPTH) return raw;

  const envelope = asRecord(raw);
  if (!envelope) return raw;

  let data = parseEmbeddedJson(envelope.data);
  if (!isSuccessFlag(envelope.success) || data == null) {
    return raw;
  }

  if (typeof data !== 'object') {
    return data;
  }

  const innerRecord = asRecord(data);
  if (!innerRecord) return data;

  // Keep unwrapping pure envelopes; stop when we see user/email or a flat user row.
  const hasIdentity =
    innerRecord.user != null ||
    innerRecord.organization != null ||
    innerRecord.org != null ||
    pickStr(innerRecord, 'email', 'user_id', 'userId') != null;

  if (
    isSuccessFlag(innerRecord.success) &&
    innerRecord.data != null &&
    !hasIdentity
  ) {
    return unwrapApiEnvelope(data, depth + 1);
  }

  return data;
}

function normalizeUserFields(user: Record<string, unknown>): ParsedCurrentUser {
  let first_name = pickStr(user, 'first_name', 'firstName');
  let last_name = pickStr(user, 'last_name', 'lastName');
  const combined = pickStr(user, 'name', 'display_name', 'displayName', 'full_name', 'fullName');
  if (!first_name && !last_name && combined) {
    const parts = combined.split(/\s+/).filter(Boolean);
    first_name = parts[0];
    last_name = parts.slice(1).join(' ') || undefined;
  }

  return {
    user_id: pickStr(user, 'user_id', 'userId', 'sub', 'id'),
    email: pickStr(user, 'email'),
    first_name,
    last_name,
    organization_id: pickStr(user, 'organization_id', 'organizationId', 'org_id', 'orgId'),
    permissions: Array.isArray(user.permissions)
      ? (user.permissions as string[])
      : undefined,
  };
}

function normalizeOrganization(org: Record<string, unknown>): {
  organization_id?: string;
  organization_name?: string;
} {
  return {
    organization_id: pickStr(org, 'organization_id', 'organizationId', 'id'),
    organization_name: pickStr(org, 'name', 'organization_name', 'organizationName'),
  };
}

export function parseCurrentUserResponse(raw: unknown): ParsedCurrentUser {
  const inner = unwrapApiEnvelope(raw);
  const record = asRecord(inner);
  if (!record) {
    return {};
  }

  const nestedUser =
    asRecord(record.user) ?? asRecord(record.User);
  if (nestedUser) {
    const orgRecord =
      asRecord(record.organization) ??
      asRecord(record.org) ??
      asRecord(record.Organization);
    const userFields = normalizeUserFields(nestedUser);
    const orgFields = orgRecord ? normalizeOrganization(orgRecord) : {};
    return {
      ...userFields,
      organization_id: orgFields.organization_id ?? userFields.organization_id,
      organization_name: orgFields.organization_name,
    };
  }

  const flat = normalizeUserFields(record);
  const nestedOrg =
    asRecord(record.organization) ?? asRecord(record.org);
  const orgFields = nestedOrg ? normalizeOrganization(nestedOrg) : {};

  return {
    ...flat,
    organization_id: flat.organization_id ?? orgFields.organization_id,
    organization_name:
      pickStr(record, 'organization_name', 'organizationName') ??
      orgFields.organization_name,
  };
}

/** Merge identity hints from JWT claims when /users/me body is sparse. */
export function mergeJwtIdentityFallback(
  parsed: ParsedCurrentUser,
  claims: Record<string, unknown>
): ParsedCurrentUser {
  if (!claims || typeof claims !== 'object') return parsed;

  const email =
    parsed.email ??
    pickStr(claims, 'email', 'preferred_username', 'username', 'cognito:username');
  const user_id = parsed.user_id ?? pickStr(claims, 'user_id', 'userId', 'sub');
  const organization_id =
    parsed.organization_id ??
    pickStr(claims, 'organization_id', 'organizationId', 'custom:organization_id');
  const organization_name =
    parsed.organization_name ??
    pickStr(claims, 'organization_name', 'organizationName', 'custom:organization_name');

  let first_name = parsed.first_name;
  let last_name = parsed.last_name;
  if (!first_name && !last_name) {
    first_name = pickStr(claims, 'given_name', 'givenName', 'first_name', 'firstName');
    last_name = pickStr(claims, 'family_name', 'familyName', 'last_name', 'lastName');
    const name = pickStr(claims, 'name');
    if (!first_name && !last_name && name) {
      const parts = name.split(/\s+/).filter(Boolean);
      first_name = parts[0];
      last_name = parts.slice(1).join(' ') || undefined;
    }
  }

  return {
    ...parsed,
    email,
    user_id,
    first_name,
    last_name,
    organization_id,
    organization_name,
  };
}
