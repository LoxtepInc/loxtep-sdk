/**
 * Consumptions (webhook subscriptions) API types — LOX-1481 / LOX-1510
 */

export interface Consumption {
  consumption_id: string;
  data_product_id: string;
  organization_id: string;
  created_by: string | null;
  name: string | null;
  description: string | null;
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

export interface ConsumptionsListParams {
  page?: number;
  page_size?: number;
  status?: string;
  is_active?: boolean;
}

export interface ConsumptionsListResponse {
  success: true;
  data: {
    items: Consumption[];
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

export interface ConsumptionCreateInput {
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

export interface ConsumptionUpdateInput extends Partial<ConsumptionCreateInput> {
  status?: string;
  is_active?: boolean;
}
