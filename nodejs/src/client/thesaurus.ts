/**
 * Thesaurus API (LOX-1476 + Phase 2 meaning parity).
 * MCP: loxtep_meaning list_terms / get_term / create_term / update_term /
 * delete_term / sync_vocabulary / create_enterprise_override / append synonym.
 *
 * Backend:
 *   GET|POST /graph/organizations/:organization_id/thesaurus
 *   GET|PUT|DELETE /graph/organizations/:organization_id/thesaurus/:term_id
 *   POST /graph/organizations/:organization_id/thesaurus/sync
 *   POST /graph/organizations/:organization_id/thesaurus/synonyms
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  CreateEnterpriseOverrideInput,
  CreateThesaurusTermInput,
  DeleteThesaurusTermResult,
  SyncVocabularyInput,
  SyncVocabularyResult,
  ThesaurusTerm,
  ThesaurusListResponse,
  UpdateThesaurusTermInput,
} from './thesaurus-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function requireOrg(organization_id: string | undefined, orgId?: string): string {
  const org = orgId ?? organization_id;
  if (!org) {
    throw new Error('organization_id required (pass explicitly or set on client)');
  }
  return org;
}

function thesaurusBase(org: string): string {
  return `/graph/organizations/${encodeURIComponent(org)}/thesaurus`;
}

async function fetchTerms(
  http: LoxtepHttpClient,
  organization_id: string
): Promise<ThesaurusTerm[]> {
  const res = await http.get<ThesaurusListResponse>(thesaurusBase(organization_id));
  return res?.data?.terms ?? [];
}

export function createThesaurusApi(
  http: LoxtepHttpClient,
  organization_id?: string
): {
  list_terms: (orgId?: string) => Promise<ThesaurusTerm[]>;
  get_term: (term_id: string, orgId?: string) => Promise<ThesaurusTerm>;
  create_term: (input: CreateThesaurusTermInput) => Promise<ThesaurusTerm>;
  update_term: (term_id: string, input: UpdateThesaurusTermInput) => Promise<ThesaurusTerm>;
  delete_term: (term_id: string, orgId?: string) => Promise<DeleteThesaurusTermResult>;
  sync_vocabulary: (input: SyncVocabularyInput) => Promise<SyncVocabularyResult>;
  create_enterprise_override: (
    input: CreateEnterpriseOverrideInput
  ) => Promise<ThesaurusTerm>;
  resolve_canonical_key: (key_or_alias: string, orgId?: string) => Promise<string | null>;
  append_synonym: (
    canonical_key: string,
    alias_path: string,
    options?: { system?: string; precedence?: number; orgId?: string }
  ) => Promise<ThesaurusTerm>;
} {
  return {
    async list_terms(orgId?: string): Promise<ThesaurusTerm[]> {
      const org = requireOrg(organization_id, orgId);
      return fetchTerms(http, org);
    },

    async get_term(term_id: string, orgId?: string): Promise<ThesaurusTerm> {
      if (!term_id) throw new Error('term_id is required');
      const org = requireOrg(organization_id, orgId);
      const res = await http.get(`${thesaurusBase(org)}/${encodeURIComponent(term_id)}`);
      return unwrapData<ThesaurusTerm>(res);
    },

    async create_term(input: CreateThesaurusTermInput): Promise<ThesaurusTerm> {
      const org = requireOrg(organization_id, input.organization_id);
      const body: Record<string, unknown> = {
        canonical_key: input.canonical_key,
        scheme: input.scheme ?? 'field',
        precedence: input.precedence ?? 100,
        aliases: input.aliases ?? [],
      };
      if (input.definition !== undefined) body.definition = input.definition;
      if (input.broader !== undefined) body.broader = input.broader;
      if (input.narrower !== undefined) body.narrower = input.narrower;
      if (input.related !== undefined) body.related = input.related;
      if (input.domain !== undefined) body.domain = input.domain;
      const res = await http.post(thesaurusBase(org), body);
      return unwrapData<ThesaurusTerm>(res);
    },

    async update_term(
      term_id: string,
      input: UpdateThesaurusTermInput
    ): Promise<ThesaurusTerm> {
      if (!term_id) throw new Error('term_id is required');
      const org = requireOrg(organization_id, input.organization_id);
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (key === 'organization_id') continue;
        if (value !== undefined) body[key] = value;
      }
      const res = await http.put(
        `${thesaurusBase(org)}/${encodeURIComponent(term_id)}`,
        body
      );
      return unwrapData<ThesaurusTerm>(res);
    },

    async delete_term(term_id: string, orgId?: string): Promise<DeleteThesaurusTermResult> {
      if (!term_id) throw new Error('term_id is required');
      const org = requireOrg(organization_id, orgId);
      const res = await http.delete(
        `${thesaurusBase(org)}/${encodeURIComponent(term_id)}`
      );
      const envelope = res as {
        data?: ThesaurusTerm;
        warnings?: string[];
      };
      return {
        term: unwrapData<ThesaurusTerm>(res),
        warnings: envelope.warnings,
      };
    },

    async sync_vocabulary(input: SyncVocabularyInput): Promise<SyncVocabularyResult> {
      const org = requireOrg(organization_id, input.organization_id);
      const body = {
        domain: input.domain,
        terms: input.terms,
        mode: input.mode,
        dry_run: input.dry_run ?? false,
      };
      const res = await http.post(`${thesaurusBase(org)}/sync`, body);
      return unwrapData<SyncVocabularyResult>(res);
    },

    async create_enterprise_override(
      input: CreateEnterpriseOverrideInput
    ): Promise<ThesaurusTerm> {
      const org = requireOrg(organization_id, input.organization_id);
      const body: Record<string, unknown> = {
        canonical_key: input.canonical_key,
        enterprise_definition: input.enterprise_definition,
        divergence_reason: input.divergence_reason,
        is_override: true,
        override_source: input.override_source ?? 'manual',
        scheme: input.scheme ?? 'field',
        precedence: input.precedence ?? 100,
        aliases: input.aliases ?? [],
      };
      if (input.definition !== undefined) body.definition = input.definition;
      if (input.broader !== undefined) body.broader = input.broader;
      if (input.narrower !== undefined) body.narrower = input.narrower;
      if (input.related !== undefined) body.related = input.related;
      if (input.baseline_assumption !== undefined) {
        body.baseline_assumption = input.baseline_assumption;
      }
      if (input.linked_data_product_ids !== undefined) {
        body.linked_data_product_ids = input.linked_data_product_ids;
      }
      const res = await http.post(thesaurusBase(org), body);
      return unwrapData<ThesaurusTerm>(res);
    },

    async resolve_canonical_key(key_or_alias: string, orgId?: string): Promise<string | null> {
      const org = requireOrg(organization_id, orgId);
      const terms = await fetchTerms(http, org);
      const k = key_or_alias.toLowerCase();
      for (const term of terms) {
        if (term.canonical_key.toLowerCase() === k) return term.canonical_key;
        const paths = (term.aliases ?? []).map(a => (a.path ?? '').toLowerCase());
        if (paths.includes(k)) return term.canonical_key;
      }
      return null;
    },

    async append_synonym(
      canonical_key: string,
      alias_path: string,
      options?: { system?: string; precedence?: number; orgId?: string }
    ): Promise<ThesaurusTerm> {
      const org = requireOrg(organization_id, options?.orgId);
      const res = await http.post<{ success: true; data: ThesaurusTerm }>(
        `${thesaurusBase(org)}/synonyms`,
        {
          canonical_key,
          alias_path,
          system: options?.system,
          precedence: options?.precedence ?? 100,
        }
      );
      return res.data;
    },
  };
}

export type ThesaurusApi = ReturnType<typeof createThesaurusApi>;
