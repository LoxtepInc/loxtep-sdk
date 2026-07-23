/**
 * Normalize GET /organizations/users/me — API returns `{ success, data: { user, organization } }`
 * for `user_id=me`, or `{ success, data: User }` for other ids.
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Unwrap `{ success, data }` when present; otherwise return the raw body. */
export function unwrapApiEnvelope(raw: unknown): unknown {
  const envelope = asRecord(raw);
  if (envelope?.success === true && envelope.data != null && typeof envelope.data === 'object') {
    return envelope.data;
  }
  return raw;
}

export function parseCurrentUserResponse(raw: unknown): ParsedCurrentUser {
  const inner = unwrapApiEnvelope(raw);
  const record = asRecord(inner);
  if (!record) {
    return {};
  }

  const nestedUser = asRecord(record.user);
  if (nestedUser) {
    const org = asRecord(record.organization);
    return {
      user_id: str(nestedUser.user_id),
      email: str(nestedUser.email),
      first_name: str(nestedUser.first_name),
      last_name: str(nestedUser.last_name),
      organization_id: str(org?.organization_id) ?? str(nestedUser.organization_id),
      organization_name: str(org?.name),
      permissions: Array.isArray(nestedUser.permissions)
        ? (nestedUser.permissions as string[])
        : undefined,
    };
  }

  return {
    user_id: str(record.user_id),
    email: str(record.email),
    first_name: str(record.first_name),
    last_name: str(record.last_name),
    organization_id: str(record.organization_id),
    organization_name: str(record.organization_name) ?? str(record.name),
    permissions: Array.isArray(record.permissions) ? (record.permissions as string[]) : undefined,
  };
}
