/**
 * Target types — how a data product delivers its data to an external system
 * (delivery-side sink bindings).
 *
 * ("consumptions"/"delivery" are the backend terms; the SDK surface names these
 * `targets`.) The underlying API endpoints are unchanged
 * (`/dataproducts/:data_product_id/consumptions`).
 */

/**
 * Discriminator for the type of delivery mechanism configured on a target.
 */
export type TargetType =
  | 'webhook'
  | 'api_endpoint'
  | 'export'
  | 'database_sync'
  | 'bi_connect'
  | 'event_stream';

/**
 * A target defines how a data product makes its data available to an external
 * system. Backed by the "consumption" record.
 */
export interface Target {
  consumption_id: string;
  data_product_id: string;
  organization_id: string;
  created_by: string | null;
  name: string | null;
  description: string | null;
  /** The type of delivery mechanism. */
  targetType: TargetType;
  delivery_method: string;
  status: string;
  is_active: boolean;
  endpoint_url: string | null;
  method: string;
  auth_type: string | null;
  headers: Record<string, string>;
  /** Redacted in API: "••••••••" when set, null when not. Never raw value. */
  secret_token: string | null;
  /** True when a secret is configured. */
  secret_token_set: boolean;
  filters: Record<string, unknown>;
  configuration: Record<string, unknown>;
  metadata: Record<string, unknown>;
  max_retries: number;
  retry_delay_seconds: number;
  timeout_seconds: number;
  batch_mode: boolean;
  batch_size: number | null;
  delivery_stats: Record<string, unknown>;
  last_delivery_attempt: string | null;
  last_successful_delivery: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TargetsListParams {
  page?: number;
  page_size?: number;
  status?: string;
  is_active?: boolean;
}

export interface TargetsListResponse {
  success: true;
  data: {
    items: Target[];
    pagination: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
  };
}

export interface TargetCreateInput {
  /** The type of delivery mechanism to configure. */
  targetType?: TargetType;
  name?: string | null;
  description?: string | null;
  delivery_method?: string;
  endpoint_url?: string | null;
  method?: string;
  auth_type?: string | null;
  headers?: Record<string, string>;
  secret_token?: string | null;
  filters?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  max_retries?: number;
  retry_delay_seconds?: number;
  timeout_seconds?: number;
  batch_mode?: boolean;
  batch_size?: number | null;
}

export interface TargetUpdateInput extends Partial<TargetCreateInput> {
  status?: string;
  is_active?: boolean;
}
