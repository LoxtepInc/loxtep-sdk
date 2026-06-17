/**
 * Promises API (customer term for data contracts): list, get.
 * Backend: GET /dataproducts/datacontracts, GET /dataproducts/datacontracts/:contract_id.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { Promise_, PromisesListResponse, PromisesListFilters } from './promises-types.js';

const PROMISES_BASE = '/dataproducts/datacontracts';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createPromisesApi(http: LoxtepHttpClient): {
  get: (contract_id: string) => Promise<Promise_>;
  list: (filters?: PromisesListFilters) => Promise<PromisesListResponse['data']>;
  create: (payload: {
    data_product_id: string;
    name: string;
    description?: string;
    version?: string;
    status?: string;
    terms?: Record<string, unknown>;
    schema_version_id?: string;
  }) => Promise<Promise_>;
  update: (contract_id: string, payload: Record<string, unknown>) => Promise<Promise_>;
  delete: (contract_id: string) => Promise<void>;
} {
  return {
    async list(filters?: PromisesListFilters): Promise<PromisesListResponse['data']> {
      const params: Record<string, string | number | undefined> = {
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 20,
        sort_by: filters?.sort_by ?? 'created_at',
        sort_order: filters?.sort_order ?? 'desc',
      };
      if (filters?.data_product_id) params.data_product_id = filters.data_product_id;
      if (filters?.status) params.status = filters.status;
      if (filters?.search) params.search = filters.search;
      const qs = buildQueryString(params);
      const res = await http.get<PromisesListResponse>(`${PROMISES_BASE}${qs}`);
      return res.data;
    },

    async get(contract_id: string): Promise<Promise_> {
      const res = await http.get<{ success: true; data: Promise_ }>(
        `${PROMISES_BASE}/${encodeURIComponent(contract_id)}`
      );
      return res.data;
    },

    async create(payload: {
      data_product_id: string;
      name: string;
      description?: string;
      version?: string;
      status?: string;
      terms?: Record<string, unknown>;
      schema_version_id?: string;
    }): Promise<Promise_> {
      const res = await http.post<{ success: true; data: Promise_ }>(PROMISES_BASE, payload);
      return res.data;
    },

    async update(contract_id: string, payload: Record<string, unknown>): Promise<Promise_> {
      const res = await http.put<{ success: true; data: Promise_ }>(
        `${PROMISES_BASE}/${encodeURIComponent(contract_id)}`,
        payload
      );
      return res.data;
    },

    async delete(contract_id: string): Promise<void> {
      await http.delete(`${PROMISES_BASE}/${encodeURIComponent(contract_id)}`);
    },
  };
}
