/**
 * Improvements API: list, apply, reject.
 * Canonical API: GET /ai/improvements, POST /ai/improvements.
 *
 * Requirements: 8.3, 8.4, 8.5, 8.6
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Improvement,
  ImprovementsListFilters,
  ImprovementsListResponse,
  ImprovementActionResponse,
} from './improvements-types.js';

const IMPROVEMENTS_BASE = '/ai/improvements';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export interface ImprovementsApi {
  /** List improvements for the authenticated organization (R8.3). */
  list: (filters?: ImprovementsListFilters) => Promise<{ improvements: Improvement[]; cursor: string | null }>;
  /** Apply an improvement — sets status to 'applied' on the server (R8.4). */
  apply: (id: string) => Promise<{ id: string; status: 'applied'; updated_at: string }>;
  /** Reject an improvement — sets status to 'rejected' on the server (R8.5). */
  reject: (id: string) => Promise<{ id: string; status: 'rejected'; updated_at: string }>;
}

export function createImprovementsApi(http: LoxtepHttpClient): ImprovementsApi {
  return {
    async list(filters?: ImprovementsListFilters) {
      const params: Record<string, string | number | undefined> = {};
      if (filters?.status) params.status = filters.status;
      if (filters?.workflow_name) params.workflow_name = filters.workflow_name;
      if (filters?.limit != null) params.limit = filters.limit;
      if (filters?.cursor) params.cursor = filters.cursor;
      const qs = buildQueryString(params);
      const res = await http.get<ImprovementsListResponse>(`${IMPROVEMENTS_BASE}${qs}`);
      return res.data;
    },

    async apply(id: string) {
      const res = await http.post<ImprovementActionResponse>(IMPROVEMENTS_BASE, {
        id,
        action: 'apply',
      });
      return res.data as { id: string; status: 'applied'; updated_at: string };
    },

    async reject(id: string) {
      const res = await http.post<ImprovementActionResponse>(IMPROVEMENTS_BASE, {
        id,
        action: 'reject',
      });
      return res.data as { id: string; status: 'rejected'; updated_at: string };
    },
  };
}
