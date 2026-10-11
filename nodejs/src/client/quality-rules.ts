/**
 * Product quality rules. Backend: /dataproducts/quality-rules.
 * There is no GET-by-id route. get() lists and finds the id.
 */

import type { LoxtepHttpClient } from '../http/client.js';

export interface QualityRuleInput {
  data_product_id?: string;
  name?: string;
  description?: string;
  rule_type?: string;
  condition?: string;
  threshold?: number;
  severity?: string;
  metadata?: Record<string, unknown>;
}

function unwrap<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'data' in res) {
    return (res as { data: T }).data;
  }
  return res as T;
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createQualityRulesApi(http: LoxtepHttpClient): {
  list: (filters?: {
    data_product_id?: string;
    domain_id?: string;
    rule_type?: string;
    severity?: string;
    page?: number;
    page_size?: number;
  }) => Promise<unknown>;
  get: (qualityRuleId: string, filters?: { data_product_id?: string }) => Promise<unknown>;
  create: (input: QualityRuleInput) => Promise<unknown>;
  update: (qualityRuleId: string, input: QualityRuleInput) => Promise<unknown>;
  delete: (qualityRuleId: string) => Promise<unknown>;
} {
  return {
    async list(filters = {}) {
      const qs = buildQueryString({
        data_product_id: filters.data_product_id,
        domain_id: filters.domain_id,
        rule_type: filters.rule_type,
        severity: filters.severity,
        page: filters.page,
        page_size: filters.page_size,
      });
      return unwrap(await http.get(`/dataproducts/quality-rules${qs}`));
    },

    async get(qualityRuleId: string, filters = {}) {
      const listed = await this.list({ ...filters, page_size: 100 });
      const items = Array.isArray(listed)
        ? listed
        : Array.isArray((listed as { items?: unknown[] })?.items)
          ? (listed as { items: unknown[] }).items
          : Array.isArray((listed as { quality_rules?: unknown[] })?.quality_rules)
            ? (listed as { quality_rules: unknown[] }).quality_rules
            : [];
      const match = items.find(item => {
        if (!item || typeof item !== 'object') return false;
        const record = item as Record<string, unknown>;
        return record.quality_rule_id === qualityRuleId || record.id === qualityRuleId;
      });
      if (!match) {
        const err = new Error(
          `Quality rule ${qualityRuleId} was not in the list. GET /quality-rules has no by-id route.`
        );
        (err as { code?: string }).code = 'not_in_list';
        throw err;
      }
      return match;
    },

    async create(input: QualityRuleInput) {
      return unwrap(await http.post('/dataproducts/quality-rules', input));
    },

    async update(qualityRuleId: string, input: QualityRuleInput) {
      return unwrap(
        await http.put(`/dataproducts/quality-rules/${encodeURIComponent(qualityRuleId)}`, input)
      );
    },

    async delete(qualityRuleId: string) {
      return unwrap(
        await http.delete(`/dataproducts/quality-rules/${encodeURIComponent(qualityRuleId)}`)
      );
    },
  };
}
