/**
 * Consumptions API (webhook subscriptions for data products) — LOX-1481 / LOX-1510
 * list, get, create, update, delete for /dataproducts/:data_product_id/consumptions
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Consumption,
  ConsumptionsListParams,
  ConsumptionsListResponse,
  ConsumptionCreateInput,
  ConsumptionUpdateInput,
} from './consumptions-types.js';

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createConsumptionsApi(http: LoxtepHttpClient): {
  list: (
    data_product_id: string,
    params?: ConsumptionsListParams
  ) => Promise<ConsumptionsListResponse['data']>;
  get: (data_product_id: string, consumption_id: string) => Promise<Consumption>;
  create: (data_product_id: string, body: ConsumptionCreateInput) => Promise<Consumption>;
  update: (
    data_product_id: string,
    consumption_id: string,
    body: ConsumptionUpdateInput
  ) => Promise<Consumption>;
  delete: (data_product_id: string, consumption_id: string) => Promise<void>;
} {
  const base = (data_product_id: string) =>
    `/dataproducts/${encodeURIComponent(data_product_id)}/consumptions`;

  return {
    async list(
      data_product_id: string,
      params?: ConsumptionsListParams
    ): Promise<ConsumptionsListResponse['data']> {
      const qs = params
        ? buildQueryString({
            page: params.page ?? 1,
            page_size: params.page_size ?? 20,
            status: params.status,
            is_active: params.is_active,
          })
        : '';
      const res = await http.get<ConsumptionsListResponse>(`${base(data_product_id)}${qs}`);
      return res.data;
    },

    async get(data_product_id: string, consumption_id: string): Promise<Consumption> {
      const res = await http.get<{ success: true; data: Consumption }>(
        `${base(data_product_id)}/${encodeURIComponent(consumption_id)}`
      );
      return res.data;
    },

    async create(data_product_id: string, body: ConsumptionCreateInput): Promise<Consumption> {
      const res = await http.post<{ success: true; data: Consumption }>(
        base(data_product_id),
        body
      );
      return res.data;
    },

    async update(
      data_product_id: string,
      consumption_id: string,
      body: ConsumptionUpdateInput
    ): Promise<Consumption> {
      const res = await http.put<{ success: true; data: Consumption }>(
        `${base(data_product_id)}/${encodeURIComponent(consumption_id)}`,
        body
      );
      return res.data;
    },

    async delete(data_product_id: string, consumption_id: string): Promise<void> {
      await http.delete(`${base(data_product_id)}/${encodeURIComponent(consumption_id)}`);
    },
  };
}
