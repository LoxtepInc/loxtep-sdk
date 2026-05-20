/**
 * Quality metrics API. list, get, create. Backend: GET /dataproducts/quality-metrics,
 * GET /dataproducts/quality-metrics/:id, POST /dataproducts/quality-metrics.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  QualityMetric,
  QualityListFilters,
  QualityListResponse,
  CreateQualityMetricInput,
} from './quality-types.js';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createQualityApi(http: LoxtepHttpClient): {
  list: (filters: QualityListFilters) => Promise<QualityListResponse>;
  get: (metric_id: string) => Promise<QualityMetric>;
  create: (input: CreateQualityMetricInput) => Promise<QualityMetric>;
} {
  return {
    async list(filters: QualityListFilters): Promise<QualityListResponse> {
      const qs = buildQueryString({
        data_product_id: filters.data_product_id,
        metric_type: filters.metric_type,
        status: filters.status,
        severity: filters.severity,
        from_date: filters.from_date,
        to_date: filters.to_date,
        page: filters.page ?? 1,
        page_size: filters.page_size ?? 20,
        sort_by: filters.sort_by ?? 'measured_at',
        sort_order: filters.sort_order ?? 'desc',
      });
      const res = await http.get<QualityListResponse>(`/dataproducts/quality-metrics${qs}`);
      const payload = (res as { data?: QualityListResponse }).data ?? res;
      const items = (payload as QualityListResponse).items ?? [];
      const pagination = (payload as QualityListResponse).pagination ?? {
        page: 1,
        page_size: 20,
        total: items.length,
        total_pages: 1,
        has_next: false,
        has_prev: false,
      };
      return { items, pagination };
    },

    async get(metric_id: string): Promise<QualityMetric> {
      const res = await http.get<{ metric: QualityMetric }>(
        `/dataproducts/quality-metrics/${encodeURIComponent(metric_id)}`
      );
      const payload = (res as { data?: { metric: QualityMetric } }).data ?? res;
      const metric = (payload as { metric?: QualityMetric }).metric ?? (res as QualityMetric);
      return metric;
    },

    async create(input: CreateQualityMetricInput): Promise<QualityMetric> {
      const res = await http.post<{ metric: QualityMetric; message?: string }>(
        '/dataproducts/quality-metrics',
        input
      );
      const payload = (res as { data?: { metric: QualityMetric } }).data ?? res;
      const metric = (payload as { metric?: QualityMetric }).metric ?? (res as QualityMetric);
      return metric;
    },
  };
}
