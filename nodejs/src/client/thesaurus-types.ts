/**
 * Thesaurus API types (LOX-1476 + Phase 2 meaning parity).
 * Canonical correlation keys, per-system aliases, enterprise overrides, sync.
 */

export type ThesaurusScheme = 'field' | 'entity' | 'custom';

export type OverrideSource =
  | 'inferred_rejection'
  | 'govern_step'
  | 'manual'
  | 'agent_gap';

export type OverrideStatus = 'active' | 'proposed' | 'retired';

export interface ThesaurusAlias {
  system?: string;
  path: string;
}

export interface ThesaurusTerm {
  term_id: string;
  organization_id: string;
  canonical_key: string;
  /** Linked ontology concept URI when authored via concept registration. */
  concept_uri?: string | null;
  scheme?: ThesaurusScheme;
  precedence: number;
  aliases: ThesaurusAlias[];
  definition?: string | null;
  broader?: string[];
  narrower?: string[];
  related?: string[];
  is_override?: boolean;
  enterprise_definition?: string | null;
  baseline_assumption?: string | null;
  divergence_reason?: string | null;
  override_source?: OverrideSource | null;
  override_status?: OverrideStatus | null;
  linked_data_product_ids?: string[];
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ThesaurusListResponse {
  success: true;
  data: { terms: ThesaurusTerm[] };
}

export interface ThesaurusResolveResponse {
  success: true;
  data: { canonical_key: string };
}

export interface CreateThesaurusTermInput {
  canonical_key: string;
  scheme?: ThesaurusScheme;
  precedence?: number;
  aliases?: ThesaurusAlias[];
  definition?: string | null;
  broader?: string[];
  narrower?: string[];
  related?: string[];
  domain?: string;
  organization_id?: string;
}

export interface UpdateThesaurusTermInput {
  canonical_key?: string;
  scheme?: ThesaurusScheme;
  precedence?: number;
  aliases?: ThesaurusAlias[];
  definition?: string | null;
  broader?: string[];
  narrower?: string[];
  related?: string[];
  domain?: string;
  is_override?: boolean;
  enterprise_definition?: string | null;
  baseline_assumption?: string | null;
  divergence_reason?: string | null;
  override_source?: OverrideSource | null;
  override_status?: OverrideStatus | null;
  linked_data_product_ids?: string[];
  organization_id?: string;
}

export interface DeleteThesaurusTermResult {
  term: ThesaurusTerm;
  warnings?: string[];
}

export interface SyncVocabularyTermInput {
  canonical_key: string;
  scheme: ThesaurusScheme;
  aliases?: ThesaurusAlias[];
  broader?: string[];
  narrower?: string[];
  related?: string[];
}

export interface SyncVocabularyInput {
  domain: string;
  terms: SyncVocabularyTermInput[];
  mode: 'full_sync' | 'additive_only';
  dry_run?: boolean;
  organization_id?: string;
}

export interface SyncVocabularyConflict {
  canonical_key: string;
  reason: string;
}

export interface SyncVocabularyResult {
  created: { count: number; term_ids: string[] };
  updated: { count: number; term_ids: string[] };
  tombstoned: { count: number; term_ids: string[] };
  unchanged: { count: number };
  conflicts: SyncVocabularyConflict[];
  dry_run: boolean;
}

export interface CreateEnterpriseOverrideInput {
  canonical_key: string;
  enterprise_definition: string;
  divergence_reason: string;
  scheme?: ThesaurusScheme;
  aliases?: ThesaurusAlias[];
  definition?: string | null;
  precedence?: number;
  broader?: string[];
  narrower?: string[];
  related?: string[];
  baseline_assumption?: string | null;
  linked_data_product_ids?: string[];
  override_source?: OverrideSource;
  organization_id?: string;
}
