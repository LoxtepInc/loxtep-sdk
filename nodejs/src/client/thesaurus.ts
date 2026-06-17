/**
 * Thesaurus API (LOX-1476). listTerms, resolveCanonicalKey.
 * Backend: GET /graph/organizations/:organization_id/thesaurus.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { ThesaurusTerm, ThesaurusListResponse } from './thesaurus-types.js';

async function fetchTerms(
  http: LoxtepHttpClient,
  organization_id: string
): Promise<ThesaurusTerm[]> {
  const res = await http.get<ThesaurusListResponse>(
    `/graph/organizations/${encodeURIComponent(organization_id)}/thesaurus`
  );
  return res?.data?.terms ?? [];
}

export function createThesaurusApi(
  http: LoxtepHttpClient,
  organization_id?: string
): {
  listTerms: (orgId?: string) => Promise<ThesaurusTerm[]>;
  resolveCanonicalKey: (key_or_alias: string, orgId?: string) => Promise<string | null>;
  append_synonym: (
    canonical_key: string,
    alias_path: string,
    options?: { system?: string; precedence?: number; orgId?: string }
  ) => Promise<ThesaurusTerm>;
} {
  const resolveOrg = (orgId?: string) => orgId ?? organization_id;
  return {
    async listTerms(orgId?: string): Promise<ThesaurusTerm[]> {
      const org = resolveOrg(orgId);
      if (!org) throw new Error('organization_id required (pass to listTerms or set on client)');
      return fetchTerms(http, org);
    },

    async resolveCanonicalKey(key_or_alias: string, orgId?: string): Promise<string | null> {
      const org = resolveOrg(orgId);
      if (!org)
        throw new Error('organization_id required (pass to resolveCanonicalKey or set on client)');
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
      const org = resolveOrg(options?.orgId);
      if (!org) throw new Error('organization_id required (pass options.orgId or set on client)');
      const res = await http.post<{ success: true; data: ThesaurusTerm }>(
        `/graph/organizations/${encodeURIComponent(org)}/thesaurus/synonyms`,
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
