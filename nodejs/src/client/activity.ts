/**
 * Activity API: list activity and audit entries (unified read-model query).
 * Canonical API: GET /ai/activity.
 * Synchronous read (R18.6 carve-out).
 *
 * Requirements: 7.4, 18.5
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  ActivityEntry,
  ActivityListFilters,
  ActivityListResponse,
} from './activity-types.js';

const ACTIVITY_BASE = '/ai/activity';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export interface ActivityApi {
  /**
   * List activity and audit entries ordered by UTC timestamp DESC with stable entry_id tie-break.
   * Applies source/actor/resource-type/time-range filters combined with AND (R7.4).
   * Synchronous read — R18.6 carve-out.
   */
  list: (filters?: ActivityListFilters) => Promise<{ entries: ActivityEntry[]; cursor: string | null }>;
}

export function createActivityApi(http: LoxtepHttpClient): ActivityApi {
  return {
    async list(filters?: ActivityListFilters) {
      const params: Record<string, string | number | undefined> = {};
      if (filters?.source) params.source = filters.source;
      if (filters?.actor) params.actor = filters.actor;
      if (filters?.resource_type) params.resource_type = filters.resource_type;
      if (filters?.start) params.start = filters.start;
      if (filters?.end) params.end = filters.end;
      if (filters?.limit != null) params.limit = filters.limit;
      if (filters?.cursor) params.cursor = filters.cursor;
      const qs = buildQueryString(params);
      const res = await http.get<ActivityListResponse>(`${ACTIVITY_BASE}${qs}`);
      return res.data;
    },
  };
}
