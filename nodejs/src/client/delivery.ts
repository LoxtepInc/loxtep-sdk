/**
 * Delivery API — the primary namespace for managing delivery interfaces
 * on data products.
 *
 * Delivery interfaces define how a data product makes its data available to
 * external systems (webhooks, API endpoints, exports, database syncs, BI
 * connections, event streams).
 *
 * This module calls the same underlying HTTP endpoints as the legacy
 * `consumptions` namespace (`/dataproducts/:data_product_id/consumptions`)
 * but uses the canonical "delivery" terminology.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  DeliveryInterface,
  DeliveryListParams,
  DeliveryListResponse,
  DeliveryCreateInput,
  DeliveryUpdateInput,
} from './delivery-types.js';

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export interface DeliveryApi {
  list: (
    data_product_id: string,
    params?: DeliveryListParams
  ) => Promise<DeliveryListResponse['data']>;
  get: (data_product_id: string, delivery_id: string) => Promise<DeliveryInterface>;
  create: (data_product_id: string, body: DeliveryCreateInput) => Promise<DeliveryInterface>;
  update: (
    data_product_id: string,
    delivery_id: string,
    body: DeliveryUpdateInput
  ) => Promise<DeliveryInterface>;
  delete: (data_product_id: string, delivery_id: string) => Promise<void>;
}

/**
 * Map a raw API response (Consumption shape) to a DeliveryInterface by adding
 * the `deliveryType` discriminator. Infers the delivery type from
 * `delivery_method` when the field isn't already present.
 */
function toDeliveryInterface(raw: Record<string, unknown>): DeliveryInterface {
  const result = raw as unknown as DeliveryInterface;
  if (!result.deliveryType) {
    // Infer deliveryType from delivery_method if not explicitly set
    const method = (raw['delivery_method'] as string) ?? 'webhook';
    result.deliveryType = inferDeliveryType(method);
  }
  return result;
}

function inferDeliveryType(
  deliveryMethod: string
): DeliveryInterface['deliveryType'] {
  switch (deliveryMethod) {
    case 'webhook':
    case 'http':
      return 'webhook';
    case 'api_endpoint':
    case 'api':
      return 'api_endpoint';
    case 'export':
    case 'bulk':
      return 'export';
    case 'database_sync':
    case 'warehouse':
      return 'database_sync';
    case 'bi_connect':
    case 'bi':
      return 'bi_connect';
    case 'event_stream':
    case 'stream':
      return 'event_stream';
    default:
      return 'webhook';
  }
}

export function createDeliveryApi(http: LoxtepHttpClient): DeliveryApi {
  const base = (data_product_id: string) =>
    `/dataproducts/${encodeURIComponent(data_product_id)}/consumptions`;

  return {
    async list(
      data_product_id: string,
      params?: DeliveryListParams
    ): Promise<DeliveryListResponse['data']> {
      const qs = params
        ? buildQueryString({
            page: params.page ?? 1,
            page_size: params.page_size ?? 20,
            status: params.status,
            is_active: params.is_active,
          })
        : '';
      const res = await http.get<{ success: true; data: { items: Record<string, unknown>[]; pagination: DeliveryListResponse['data']['pagination'] } }>(
        `${base(data_product_id)}${qs}`
      );
      return {
        items: res.data.items.map(toDeliveryInterface),
        pagination: res.data.pagination,
      };
    },

    async get(data_product_id: string, delivery_id: string): Promise<DeliveryInterface> {
      const res = await http.get<{ success: true; data: Record<string, unknown> }>(
        `${base(data_product_id)}/${encodeURIComponent(delivery_id)}`
      );
      return toDeliveryInterface(res.data);
    },

    async create(
      data_product_id: string,
      body: DeliveryCreateInput
    ): Promise<DeliveryInterface> {
      // Map deliveryType to delivery_method for the API if provided
      const apiBody: Record<string, unknown> = { ...body };
      if (body.deliveryType && !body.delivery_method) {
        apiBody['delivery_method'] = body.deliveryType;
      }
      const res = await http.post<{ success: true; data: Record<string, unknown> }>(
        base(data_product_id),
        apiBody
      );
      return toDeliveryInterface(res.data);
    },

    async update(
      data_product_id: string,
      delivery_id: string,
      body: DeliveryUpdateInput
    ): Promise<DeliveryInterface> {
      const apiBody: Record<string, unknown> = { ...body };
      if (body.deliveryType && !body.delivery_method) {
        apiBody['delivery_method'] = body.deliveryType;
      }
      const res = await http.put<{ success: true; data: Record<string, unknown> }>(
        `${base(data_product_id)}/${encodeURIComponent(delivery_id)}`,
        apiBody
      );
      return toDeliveryInterface(res.data);
    },

    async delete(data_product_id: string, delivery_id: string): Promise<void> {
      await http.delete(`${base(data_product_id)}/${encodeURIComponent(delivery_id)}`);
    },
  };
}
