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
  applied_count: number;
  skipped_count: number;
  errors: SemanticBundleImportError[];
  applied: SemanticBundleImportApplied[];
  /** Constructs that could not be represented (SHACL/OWL residuals). */
  loss_report?: SemanticBundleLossReportEntry[];
  /** True when skips or loss_report entries are present. */
  partial?: boolean;
  status_code?: number;
}
