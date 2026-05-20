/**
 * Schemas API types (data product schema). snake_case per backend conventions.
 */

export interface DataProductSchema {
  version?: string;
  fields?: unknown[];
  raw_schema?: string;
  [key: string]: unknown;
}

/** Schema version returned from data product GET when include_schema=true. */
export interface SchemaVersion {
  schema_version_id?: string;
  data_product_id?: string;
  version?: string;
  version_number?: number;
  status?: string;
  format?: string;
  fields?: unknown[];
  is_backwards_compatible?: boolean;
  created_at?: string;
  created_by?: string;
  [key: string]: unknown;
}

export interface SchemaListResponse {
  items: SchemaVersion[];
}
