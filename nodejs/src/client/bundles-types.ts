/**
 * Semantic bundle import types (Phase 2 + Phase 0 error contract).
 * REST: POST /semantic-layer/bundles/import
 */

export interface SemanticBundleArtifact {
  artifact_id: string;
  artifact_type: string;
  [key: string]: unknown;
}

export interface SemanticBundle {
  bundle_id?: string;
  bundle_version?: string;
  artifacts: SemanticBundleArtifact[];
  [key: string]: unknown;
}

export interface ImportSemanticBundleInput {
  bundle: SemanticBundle;
  dry_run?: boolean;
  /** stage (default) = save package + approval; deploy = legacy immediate apply */
  activation?: 'stage' | 'deploy';
  package_id?: string;
  package_label?: string;
}

export interface SemanticBundleImportError {
  artifact_id: string;
  artifact_type: string;
  message: string;
}

export interface SemanticBundleImportApplied {
  artifact_id: string;
  artifact_type: string;
  action: 'created' | 'updated';
}

export interface SemanticBundleLossReportEntry {
  artifact_id: string;
  artifact_type: string;
  path: string;
  reason: string;
}

/**
 * Import result. Always HTTP 200 with applied / skipped / loss_report.
 * partial is set when skipped_count > 0 or loss_report is non-empty.
 */
export interface SemanticBundleImportResult {
  dry_run: boolean;
  activation?: 'stage' | 'deploy';
  applied_count: number;
  skipped_count: number;
  errors: SemanticBundleImportError[];
  applied: SemanticBundleImportApplied[];
  /** Constructs that could not be represented (SHACL/OWL residuals). */
  loss_report?: SemanticBundleLossReportEntry[];
  /** Staged package when activation=stage */
  package?: {
    package_id: string;
    revision: number;
    content_hash: string;
    approval_request_id?: string;
    status: string;
  };
  plan?: Record<string, unknown>;
  /** True when skips or loss_report entries are present. */
  partial?: boolean;
  status_code?: number;
}

export interface ExportSemanticBundleQuery {
  domain_id?: string;
  include_thesaurus?: boolean;
  include_glossary?: boolean;
  include_entities?: boolean;
  include_shapes?: boolean;
  include_ontology?: boolean;
  include_mappings?: boolean;
  include_metrics?: boolean;
  include_policies?: boolean;
}
