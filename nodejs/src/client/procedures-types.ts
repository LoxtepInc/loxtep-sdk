/**
 * Procedures API types (LOX-1249).
 * MCP: loxtep_context list/get/create/update/delete/import/export_process_graph.
 * REST: /graph/... procedures (authored process maps), not process-intelligence discovery.
 */

export interface ProceduresApiDeps {
  organization_id?: string;
}

export type ProcedureStatus = 'draft' | 'active' | 'deprecated';

export type ProcedureExportFormat = 'jsonld' | 'yaml' | 'summary';

export type ProcedureDependencyRelationship =
  | 'feeds_into'
  | 'depends_on'
  | 'triggers'
  | 'supersedes';

/** List/detail procedure shape from the graph procedures API. */
export interface Procedure {
  procedure_id: string;
  name: string;
  description?: string | null;
  status?: ProcedureStatus | string;
  domain_id?: string | null;
  version?: string | null;
  owner?: string | null;
  steps?: ProcedureStep[];
  decisions?: ProcedureDecision[];
  triggers?: ProcedureTrigger[];
  dependencies?: ProcedureDependency[];
  metadata?: Record<string, unknown>;
  lifecycle_state?: string | null;
  change_propagation_policy?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Catch-all for platform-added fields (platform procedures, coverage, etc.). */
  [key: string]: unknown;
}

export interface ProcedureStep {
  step_id?: string;
  name: string;
  description?: string;
  order: number;
  system?: string;
  event_type?: string;
  agents?: string[];
  inputs?: string[];
  outputs?: string[];
  next_steps?: string[];
  decision_ref?: string;
  glossary_terms?: string[];
  data_product_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcedureDecisionOutcome {
  outcome: string;
  next_step_ref?: string;
  description?: string;
}

export interface ProcedureDecision {
  decision_id?: string;
  name: string;
  rule: string;
  inputs?: string[];
  outcomes: ProcedureDecisionOutcome[];
  override_authority?: string;
}

export interface ProcedureTrigger {
  trigger_id?: string;
  type: string;
  configuration?: Record<string, unknown>;
  description?: string;
}

export interface ProcedureDependency {
  target_procedure_id: string;
  relationship_type: ProcedureDependencyRelationship;
  description?: string;
}

export interface ProceduresListFilters {
  organization_id?: string;
  status?: ProcedureStatus;
  name?: string;
  has_step_with_agent?: string;
  has_trigger_type?: string;
  domain_id?: string;
  has_dependents?: boolean;
  depends_on?: string;
  created_after?: string;
  created_before?: string;
  /** Frontend helper flag; forwarded when set (not in MCP list schema). */
  include_platform?: boolean;
}

export interface ProceduresListResult {
  procedures: Procedure[];
  total?: number;
}

export interface ProcedureCreateInput {
  organization_id?: string;
  name: string;
  description?: string;
  status?: ProcedureStatus;
  domain_id?: string;
  version?: string | null;
  owner?: string | null;
  steps?: ProcedureStep[];
  decisions?: ProcedureDecision[];
  triggers?: ProcedureTrigger[];
  dependencies?: ProcedureDependency[];
  metadata?: Record<string, unknown>;
  lifecycle_state?: string;
  change_propagation_policy?: string;
}

export interface ProcedureUpdateInput {
  organization_id?: string;
  name?: string;
  description?: string;
  status?: ProcedureStatus;
  domain_id?: string | null;
  version?: string | null;
  owner?: string | null;
  steps?: ProcedureStep[];
  decisions?: ProcedureDecision[];
  triggers?: ProcedureTrigger[];
  dependencies?: ProcedureDependency[];
  metadata?: Record<string, unknown>;
  lifecycle_state?: string;
  change_propagation_policy?: string;
}

export interface ProcedureDeleteResult {
  procedure?: Procedure | Record<string, unknown>;
  warnings?: string[];
  raw?: unknown;
}

export interface ImportProcessGraphS3Reference {
  s3_bucket: string;
  s3_key: string;
}

export interface ImportProcessGraphOptions {
  create_missing_vocabulary?: boolean;
  namespace_strict?: boolean;
}

export interface ImportProcessGraphInput {
  organization_id?: string;
  /** Inline JSON-LD graph (string or object). Mutually exclusive with s3_reference. */
  graph?: string | Record<string, unknown>;
  /** S3 reference for larger graphs. Mutually exclusive with graph. */
  s3_reference?: ImportProcessGraphS3Reference;
  procedure_id?: string;
  domain_id?: string;
  skip_catalog?: boolean;
  options?: ImportProcessGraphOptions;
}

export interface ExportProcessGraphInput {
  procedure_id: string;
  format?: ProcedureExportFormat;
  preserve_namespaces?: boolean;
  organization_id?: string;
}

/** @deprecated PI discovery list envelope — prefer ProceduresListResult (graph). */
export interface ProceduresListResponse {
  success: true;
  data: {
    items: Procedure[];
    pagination: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
    };
  };
}
