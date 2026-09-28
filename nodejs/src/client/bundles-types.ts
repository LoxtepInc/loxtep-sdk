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

/**
 * Import result. Phase 0 contract: when skipped_count > 0 the backend may
 * return 207/422; the SDK still surfaces skipped_count + errors.
 */
export interface SemanticBundleImportResult {
  dry_run: boolean;
  applied_count: number;
  skipped_count: number;
  errors: SemanticBundleImportError[];
  applied: SemanticBundleImportApplied[];
  /** True when the HTTP status indicated partial failure (207/422). */
  partial?: boolean;
  status_code?: number;
}
