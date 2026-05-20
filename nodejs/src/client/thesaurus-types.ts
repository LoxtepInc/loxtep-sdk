/**
 * Thesaurus API types (LOX-1476). Canonical correlation keys and per-system aliases.
 */

export interface ThesaurusTerm {
  term_id: string;
  organization_id: string;
  canonical_key: string;
  precedence: number;
  aliases: Array<{ system?: string; path: string }>;
  created_at: string;
  updated_at: string;
}

export interface ThesaurusListResponse {
  success: true;
  data: { terms: ThesaurusTerm[] };
}

export interface ThesaurusResolveResponse {
  success: true;
  data: { canonical_key: string };
}
