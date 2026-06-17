/**
 * Schemas API (data product schema). get, list. Backend: GET /dataproducts/:id returns schema.
 * list fetches data product with include_schema and returns schema versions.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { DataProductSchema, SchemaVersion, SchemaListResponse } from './schemas-types.js';

export function createSchemasApi(http: LoxtepHttpClient): {
  get: (data_product_id: string) => Promise<DataProductSchema | null>;
  list: (data_product_id: string) => Promise<SchemaListResponse>;
  tag_pii_fields: (data_product_id: string, fields: string[]) => Promise<unknown>;
} {
  return {
    async get(data_product_id: string): Promise<DataProductSchema | null> {
      const res = await http.get<{ success?: boolean; data?: { schema?: DataProductSchema } }>(
        `/dataproducts/${encodeURIComponent(data_product_id)}?include_schema=true`
      );
      const data = (res as { data?: { schema?: DataProductSchema } }).data ?? res;
      const schema = (data as { schema?: DataProductSchema }).schema ?? null;
      return schema ?? null;
    },

    async list(data_product_id: string): Promise<SchemaListResponse> {
      const res = await http.get<{
        data?: { schema?: { versions?: SchemaVersion[] } };
        schema?: { versions?: SchemaVersion[] };
      }>(`/dataproducts/${encodeURIComponent(data_product_id)}?include_schema=true`);
      const data = (res as { data?: { schema?: { versions?: SchemaVersion[] } } }).data ?? res;
      const schema = (data as { schema?: { versions?: SchemaVersion[] } }).schema;
      const items = schema?.versions ?? [];
      return { items };
    },

    async tag_pii_fields(data_product_id: string, fields: string[]): Promise<unknown> {
      const res = await http.post<{ success: true; data: unknown }>(
        `/schemas/${encodeURIComponent(data_product_id)}/pii`,
        { fields }
      );
      return res.data;
    },
  };
}
