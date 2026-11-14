/**
 * Schemas API types (data product schema). snake_case per backend conventions.
 */

/** One data-product schema field. Requiredness and nullability are independent. */
export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  /** Whether a present field may contain null. Omitted values are treated as false. */
  nullable?: boolean;
  description?: string;
  constraints?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DataProductSchema {
  version?: string;
  fields?: SchemaField[];
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
  fields?: SchemaField[];
  is_backwards_compatible?: boolean;
  created_at?: string;
  created_by?: string;
  [key: string]: unknown;
}

export interface SchemaListResponse {
  items: SchemaVersion[];
}
