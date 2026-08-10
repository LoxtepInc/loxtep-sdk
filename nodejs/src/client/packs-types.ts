/**
 * Vocabulary pack lifecycle types (LOX-1242).
 * MCP: list_available_packs / activate_vocabulary_pack / get_pack_activation_status
 * under loxtep_meaning (semantic-layer), not loxtep_define.
 */

export type PackActivationState = 'no_pack_active' | 'activating' | 'pack_active';

export interface PackActivationStatus {
  activation_state: PackActivationState;
  active_pack_id: string | null;
  active_pack_version: string | null;
  active_pack_display_name: string | null;
  enabled_at: string | null;
}

export interface AvailablePackSummary {
  pack_id: string;
  display_name: string;
  term_count?: number;
  version?: string;
  industry_relevance?: string;
  [key: string]: unknown;
}

/**
 * Shape documented for MCP `list_available_packs`
 * (GET /graph/admin/vocabulary-packs/recommend).
 */
export interface ListAvailablePacksResult {
  recommended_pack_id?: string | null;
  confidence?: 'high' | 'medium' | 'low' | string;
  reason?: string;
  all_packs: AvailablePackSummary[];
  [key: string]: unknown;
}

export interface ActivateVocabularyPackInput {
  pack_id: string;
  /** Required by POST .../enable body; defaults to client organization_id. */
  organization_id?: string;
}

export interface ActivateVocabularyPackResult {
  pack_id: string;
  organization_id: string;
  enabled: boolean;
  enabled_at: string;
  [key: string]: unknown;
}

export interface PacksApiDeps {
  organization_id?: string;
}
