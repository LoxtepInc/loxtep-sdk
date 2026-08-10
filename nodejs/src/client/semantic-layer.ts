/**
 * Semantic layer search / artifact / completeness API (LOX-1243).
 * MCP loxtep_meaning ops (semantic-layer REST) — not packs/ontology graph admin.
 *
 *   POST /semantic-layer/search
 *   GET  /semantic-layer/{artifact_type_plural}/{id}
 *   GET  /semantic-layer/completeness[?domain_id=]
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  GetSemanticArtifactInput,
  GetSemanticCompletenessInput,
  SearchSemanticLayerInput,
  SearchSemanticLayerResult,
  SemanticArtifactType,
  SemanticCompletenessResult,
  SemanticSearchResultItem,
} from './semantic-layer-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

const SEMANTIC_ARTIFACT_PATH_SEGMENT: Partial<Record<SemanticArtifactType, string>> = {
  entity: 'entities',
  glossary_term: 'glossary',
  process_map: 'process-maps',
};

/** Path segment used by MCP get_semantic_artifact (plural / kebab routes). */
export function semanticArtifactPathSegment(artifactType: SemanticArtifactType | string): string {
  return SEMANTIC_ARTIFACT_PATH_SEGMENT[artifactType as SemanticArtifactType] ?? artifactType;
}

function normalizeSearchResult(raw: unknown): SearchSemanticLayerResult {
  const rec =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const itemsRaw = Array.isArray(rec.items) ? rec.items : [];
  const items = itemsRaw.filter(
    (item): item is SemanticSearchResultItem =>
      item != null && typeof item === 'object' && !Array.isArray(item)
  ) as SemanticSearchResultItem[];
  const paginationRaw =
    rec.pagination != null && typeof rec.pagination === 'object' && !Array.isArray(rec.pagination)
      ? (rec.pagination as Record<string, unknown>)
      : {};
  const page = typeof paginationRaw.page === 'number' ? paginationRaw.page : 1;
  const page_size = typeof paginationRaw.page_size === 'number' ? paginationRaw.page_size : 20;
  const total =
    typeof paginationRaw.total === 'number' ? paginationRaw.total : items.length;
  return {
    ...rec,
    items,
    pagination: { total, page, page_size },
  };
}

function normalizeCompleteness(raw: unknown): SemanticCompletenessResult {
  const rec =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const domains = Array.isArray(rec.domains) ? rec.domains : [];
  const needs_attention = Array.isArray(rec.needs_attention) ? rec.needs_attention : [];
  return {
    ...rec,
    domains: domains as SemanticCompletenessResult['domains'],
    needs_attention: needs_attention as SemanticCompletenessResult['needs_attention'],
  };
}

function resolveArtifactId(input: GetSemanticArtifactInput): string {
  const id = input.id ?? input.artifact_id ?? '';
  if (!id) {
    throw new Error('Either id or artifact_id is required for get_artifact');
  }
  return id;
}

export function createSemanticLayerApi(http: LoxtepHttpClient): {
  search: (input: SearchSemanticLayerInput | string) => Promise<SearchSemanticLayerResult>;
  /** MCP operation alias. */
  search_semantic_layer: (
    input: SearchSemanticLayerInput | string
  ) => Promise<SearchSemanticLayerResult>;
  get_artifact: (input: GetSemanticArtifactInput) => Promise<unknown>;
  /** MCP operation alias. */
  get_semantic_artifact: (input: GetSemanticArtifactInput) => Promise<unknown>;
  get_completeness: (
    input?: GetSemanticCompletenessInput
  ) => Promise<SemanticCompletenessResult>;
  /** MCP operation alias. */
  get_semantic_completeness: (
    input?: GetSemanticCompletenessInput
  ) => Promise<SemanticCompletenessResult>;
} {
  async function search(
    input: SearchSemanticLayerInput | string
  ): Promise<SearchSemanticLayerResult> {
    const body: SearchSemanticLayerInput =
      typeof input === 'string' ? { query: input } : input;
    if (!body.query) {
      throw new Error('query is required for semantic layer search');
    }
    const res = await http.post('/semantic-layer/search', {
      query: body.query,
      artifact_types: body.artifact_types,
      domain: body.domain,
      industry_relevance: body.industry_relevance,
      page: body.page ?? 1,
      page_size: body.page_size ?? 20,
    });
    return normalizeSearchResult(unwrapData(res));
  }

  async function get_artifact(input: GetSemanticArtifactInput): Promise<unknown> {
    if (!input.artifact_type) {
      throw new Error('artifact_type is required for get_artifact');
    }
    const id = resolveArtifactId(input);
    const segment = semanticArtifactPathSegment(input.artifact_type);
    const path = `/semantic-layer/${segment}/${encodeURIComponent(id)}`;
    const res = await http.get(path);
    return unwrapData(res);
  }

  async function get_completeness(
    input: GetSemanticCompletenessInput = {}
  ): Promise<SemanticCompletenessResult> {
    const qs = input.domain_id
      ? `?domain_id=${encodeURIComponent(input.domain_id)}`
      : '';
    const res = await http.get(`/semantic-layer/completeness${qs}`);
    return normalizeCompleteness(unwrapData(res));
  }

  return {
    search,
    search_semantic_layer: search,
    get_artifact,
    get_semantic_artifact: get_artifact,
    get_completeness,
    get_semantic_completeness: get_completeness,
  };
}

export type SemanticLayerApi = ReturnType<typeof createSemanticLayerApi>;
