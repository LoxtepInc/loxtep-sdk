/**
 * Quality metrics API types. snake_case per backend conventions.
 */

export interface QualityMetric {
  metric_id?: string;
  data_product_id?: string;
  metric_type?: string;
  value?: number;
  threshold?: number;
  status?: string;
  severity?: string;
  measured_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface QualityListFilters {
  data_product_id: string;
  metric_type?: string;
  status?: string;
  severity?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface QualityListResponse {
  items: QualityMetric[];
  pagination: PaginationMeta;
}

/** Input for creating a quality metric. Backend: POST /dataproducts/quality-metrics. */
export interface CreateQualityMetricInput {
  data_product_id: string;
  metric_type: string;
  value: number;
  threshold?: number;
  min_threshold?: number;
  max_threshold?: number;
  status?: string;
  unit?: string;
  score?: number;
  rule_name?: string;
  rule_id?: string;
  rule_description?: string;
  severity?: string;
  business_impact?: string;
  total_records?: number;
  valid_records?: number;
  invalid_records?: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
