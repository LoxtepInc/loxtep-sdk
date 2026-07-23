/**
 * Normalize GET /organizations/instances list responses.
 * Production shape: `{ success, data: { items, pagination } }`.
 * Also accepts bare arrays, `data: Instance[]`, `data.instances`, double envelopes,
 * and camelCase pagination keys (frontend axios converts; raw SDK fetch does not).
 */

import { unwrapApiEnvelope } from './current-user-response.js';
import type { Instance, InstancesListResponse } from './instances-types.js';

export type InstancesPagination = InstancesListResponse['data']['pagination'];

const DEFAULT_PAGINATION: InstancesPagination = {
  page: 1,
  page_size: 20,
  total: 0,
  total_pages: 0,
  has_next: false,
  has_prev: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function normalizePagination(
  raw: Record<string, unknown>,
  itemCount: number
): InstancesPagination {
  const total = num(raw.total, itemCount);
  const pageSize = num(raw.page_size ?? raw.pageSize, Math.max(itemCount, 1));
  const page = num(raw.page, 1);
  const totalPages = num(raw.total_pages ?? raw.totalPages, Math.max(1, Math.ceil(total / pageSize)));
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    has_next: bool(raw.has_next ?? raw.hasNext, page < totalPages),
    has_prev: bool(raw.has_prev ?? raw.hasPrev, page > 1),
  };
}

function extractItems(record: Record<string, unknown>): unknown[] | null {
  const candidates = [record.items, record.instances, record.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  const nested = asRecord(record.data);
  if (nested) {
    for (const key of ['items', 'instances', 'results'] as const) {
      if (Array.isArray(nested[key])) return nested[key] as unknown[];
    }
    if (Array.isArray(record.data)) return record.data as unknown[];
  }
  if (Array.isArray(record.data)) return record.data as unknown[];
  return null;
}

/**
 * Parse any supported instances list API payload into `{ items, pagination }`.
 */
export function parseInstancesListResponse(raw: unknown): {
  items: Instance[];
  pagination: InstancesPagination;
} {
  const unwrapped = unwrapApiEnvelope(raw);

  if (Array.isArray(unwrapped)) {
    const items = unwrapped as Instance[];
    return {
      items,
      pagination: normalizePagination({}, items.length),
    };
  }

  const record = asRecord(unwrapped);
  if (!record) {
    return { items: [], pagination: DEFAULT_PAGINATION };
  }

  const itemsRaw = extractItems(record);
  if (itemsRaw) {
    const items = itemsRaw as Instance[];
    const paginationRecord = asRecord(record.pagination) ?? asRecord(asRecord(record.data)?.pagination);
    return {
      items,
      pagination: paginationRecord
        ? normalizePagination(paginationRecord, items.length)
        : normalizePagination({}, items.length),
    };
  }

  // One more envelope level without list keys at this depth.
  if (record.data != null && typeof record.data === 'object') {
    return parseInstancesListResponse({ success: true, data: record.data });
  }

  return { items: [], pagination: DEFAULT_PAGINATION };
}
