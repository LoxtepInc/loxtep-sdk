/**
 * Delivery Interface types — the primary interface for configuring how data
 * products deliver data to external systems.
 *
 * Replaces the "consumptions" terminology. The underlying API endpoints remain
 * unchanged (`/dataproducts/:data_product_id/consumptions`) for backward
 * compatibility.
 */

/**
 * Discriminator for the type of delivery mechanism configured on a data product.
 */
export type DeliveryType =
  | 'webhook'
  | 'api_endpoint'
  | 'export'
  | 'database_sync'
  | 'bi_connect'
  | 'event_stream';

/**
 * A delivery interface defines how a data product makes its data available
 * to an external system. Formerly called "Consumption."
 */
export interface DeliveryInterface {
  consumption_id: string;
  data_product_id: string;
  organization_id: string;
  created_by: string | null;
  name: string | null;
  description: string | null;
  /** The type of delivery mechanism. */
  deliveryType: DeliveryType;
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

export interface DeliveryListParams {
  page?: number;
  page_size?: number;
  status?: string;
  is_active?: boolean;
}

export interface DeliveryListResponse {
  success: true;
  data: {
    items: DeliveryInterface[];
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

export interface DeliveryCreateInput {
  /** The type of delivery mechanism to configure. */
  deliveryType?: DeliveryType;
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

export interface DeliveryUpdateInput extends Partial<DeliveryCreateInput> {
  status?: string;
  is_active?: boolean;
}
