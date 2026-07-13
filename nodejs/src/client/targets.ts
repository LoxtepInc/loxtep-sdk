/**
 * Targets API — the namespace for managing delivery targets on data products.
 *
 * A target defines how a data product makes its data available to an external
 * system (webhooks, API endpoints, exports, database syncs, BI connections,
 * event streams).
 *
 * ("consumptions"/"delivery" are the backend terms; the SDK surface names these
 * `targets`.) Calls `/dataproducts/:data_product_id/consumptions`.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  Target,
  TargetsListParams,
  TargetsListResponse,
  TargetCreateInput,
  TargetUpdateInput,
} from './target-types.js';

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export interface TargetsApi {
  list: (
    data_product_id: string,
    params?: TargetsListParams
  ) => Promise<TargetsListResponse['data']>;
  get: (data_product_id: string, target_id: string) => Promise<Target>;
  create: (data_product_id: string, body: TargetCreateInput) => Promise<Target>;
  update: (
    data_product_id: string,
    target_id: string,
    body: TargetUpdateInput
  ) => Promise<Target>;
  delete: (data_product_id: string, target_id: string) => Promise<void>;
}

/**
 * Map a raw API response (Consumption shape) to a Target by adding the
 * `targetType` discriminator. Infers the type from `delivery_method` when the
 * field isn't already present.
 */
function toTarget(raw: Record<string, unknown>): Target {
  const result = raw as unknown as Target;
  if (!result.targetType) {
    // Infer targetType from delivery_method if not explicitly set
    const method = (raw['delivery_method'] as string) ?? 'webhook';
    result.targetType = inferTargetType(method);
  }
  return result;
}

function inferTargetType(deliveryMethod: string): Target['targetType'] {
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

export function createTargetsApi(http: LoxtepHttpClient): TargetsApi {
  const base = (data_product_id: string) =>
    `/dataproducts/${encodeURIComponent(data_product_id)}/consumptions`;

  return {
    async list(
      data_product_id: string,
      params?: TargetsListParams
    ): Promise<TargetsListResponse['data']> {
      const qs = params
        ? buildQueryString({
            page: params.page ?? 1,
            page_size: params.page_size ?? 20,
            status: params.status,
            is_active: params.is_active,
          })
        : '';
      const res = await http.get<{ success: true; data: { items: Record<string, unknown>[]; pagination: TargetsListResponse['data']['pagination'] } }>(
        `${base(data_product_id)}${qs}`
      );
      return {
        items: res.data.items.map(toTarget),
        pagination: res.data.pagination,
      };
    },

    async get(data_product_id: string, target_id: string): Promise<Target> {
      const res = await http.get<{ success: true; data: Record<string, unknown> }>(
        `${base(data_product_id)}/${encodeURIComponent(target_id)}`
      );
      return toTarget(res.data);
    },

    async create(data_product_id: string, body: TargetCreateInput): Promise<Target> {
      // Map targetType to delivery_method for the API if provided
      const apiBody: Record<string, unknown> = { ...body };
      if (body.targetType && !body.delivery_method) {
        apiBody['delivery_method'] = body.targetType;
      }
      const res = await http.post<{ success: true; data: Record<string, unknown> }>(
        base(data_product_id),
        apiBody
      );
      return toTarget(res.data);
    },

    async update(
      data_product_id: string,
      target_id: string,
      body: TargetUpdateInput
    ): Promise<Target> {
      const apiBody: Record<string, unknown> = { ...body };
      if (body.targetType && !body.delivery_method) {
        apiBody['delivery_method'] = body.targetType;
      }
      const res = await http.put<{ success: true; data: Record<string, unknown> }>(
        `${base(data_product_id)}/${encodeURIComponent(target_id)}`,
        apiBody
      );
      return toTarget(res.data);
    },

    async delete(data_product_id: string, target_id: string): Promise<void> {
      await http.delete(`${base(data_product_id)}/${encodeURIComponent(target_id)}`);
    },
  };
}
