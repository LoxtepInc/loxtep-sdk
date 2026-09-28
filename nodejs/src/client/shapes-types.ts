/**
 * Domain shapes (org canonical schemas) — distinct from data-product schemas.
 * MCP: loxtep_define create_schema / list_schemas / get_schema / apply_schema /
 * patch_schema (align via aligned_to_concept_uri).
 *
 * REST (semantic-layer MS):
 *   POST /semantic-layer/schemas
 *   GET  /semantic-layer/schemas
 *   GET  /semantic-layer/schemas/{schema_id}
 *   PUT  /semantic-layer/schemas/{schema_id}
 *   POST /semantic-layer/schemas/{schema_id}/applications
 */

export type DomainShapeFormat = 'json-schema' | 'avro' | 'protobuf';

export interface DomainShapeField {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  pii_tagged?: boolean;
}

export interface DomainShapeSummary {
  schema_id: string;
  organization_id: string;
  domain_id?: string | null;
  name: string;
  canonical_key?: string | null;
  description?: string | null;
  latest_version?: string | null;
  version_count?: number;
  lifecycle_state?: string | null;
  change_propagation_policy?: string | null;
  owner?: string | null;
  aligned_to_concept_uri?: string | null;
  aligned_at?: string | null;
  aligned_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DomainShapeVersion {
  schema_id: string;
  schema_version_id: string;
  organization_id?: string;
  domain_id?: string;
  name?: string;
  version: string;
  format: DomainShapeFormat;
  definition?: Record<string, unknown>;
  fields?: DomainShapeField[];
  status?: string;
  aligned_to_concept_uri?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DomainShapeDetail {
  schema: DomainShapeSummary;
  versions: DomainShapeVersion[];
}

export interface CreateDomainShapeInput {
  name: string;
  version?: string;
  format: DomainShapeFormat;
  definition?: Record<string, unknown>;
  fields?: DomainShapeField[];
  domain_id?: string;
  canonical_key?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  lifecycle_state?: string;
  change_propagation_policy?: string;
  aligned_to_concept_uri?: string | null;
}

export interface ListDomainShapesFilters {
  domain_id?: string;
  /** Alias for domain_id (REST query param `domain`). */
  domain?: string;
  format?: DomainShapeFormat;
  search?: string;
}

export interface ListDomainShapesResult {
  shapes: DomainShapeSummary[];
  total: number;
}

export interface ApplyDomainShapeInput {
  schema_id: string;
  data_product_id: string;
  schema_version_id?: string;
}

export interface DomainShapeApplication {
  application_id?: string;
  organization_id?: string;
  data_product_id: string;
  schema_id: string;
  schema_version_id?: string | null;
  applied_at?: string;
  applied_by?: string | null;
}

export interface AlignDomainShapeInput {
  schema_id: string;
  /** Concept URI to align this shape to, or null to clear. */
  aligned_to_concept_uri: string | null;
}
