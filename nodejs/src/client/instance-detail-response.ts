/**
 * Normalize GET /organizations/instances/{instance_id} responses.
 * Production shape: `{ success, data: Instance }` (instance is `data` directly).
 * Also accepts `{ success, data: { instance, organization_id?, deployment_events? } }`
 * (mock / query-param variant), double envelopes, and bare instance records.
 */

import { unwrapApiEnvelope } from './current-user-response.js';
import type { Instance } from './instances-types.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isInstanceRecord(record: Record<string, unknown>): boolean {
  return typeof record.instance_id === 'string' && record.instance_id.trim() !== '';
}

/**
 * Parse any supported instance detail API payload into an `Instance`.
 * @throws when the payload does not contain a recognizable instance record.
 */
export function parseInstanceDetailResponse(raw: unknown): Instance {
  const unwrapped = unwrapApiEnvelope(raw);
  const record = asRecord(unwrapped);
  if (!record) {
    throw new Error('Invalid instance detail response');
  }

  if (isInstanceRecord(record)) {
    return record as Instance;
  }

  const nested = asRecord(record.instance);
  if (nested && isInstanceRecord(nested)) {
    return nested as Instance;
  }

  if (record.data != null && typeof record.data === 'object') {
    return parseInstanceDetailResponse({ success: true, data: record.data });
  }

  throw new Error('Instance not found in API response');
}
