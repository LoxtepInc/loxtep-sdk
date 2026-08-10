/**
 * Vocabulary pack lifecycle API (LOX-1242).
 * MCP loxtep_meaning ops (semantic-layer REST) — not loxtep_define.
 *
 *   GET  /graph/admin/vocabulary-packs/recommend
 *   POST /graph/admin/vocabulary-packs/{pack_id}/enable
 *   GET  /graph/semantic-layer/activation-state
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  ActivateVocabularyPackInput,
  ActivateVocabularyPackResult,
  AvailablePackSummary,
  ListAvailablePacksResult,
  PackActivationState,
  PackActivationStatus,
  PacksApiDeps,
} from './packs-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function requireOrg(deps: PacksApiDeps, override?: string): string {
  const org = override ?? deps.organization_id;
  if (!org) {
    throw new Error(
      'organization_id is required for pack activation (set it on the client or pass it explicitly)'
    );
  }
  return org;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(rec: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === 'string') return v;
  }
  return null;
}

function normalizeActivationState(raw: unknown): PackActivationState {
  if (raw === 'no_pack_active' || raw === 'activating' || raw === 'pack_active') {
    return raw;
  }
  return 'no_pack_active';
}

/** Normalize camelCase (graph handler) or snake_case (MCP docs) activation payloads. */
export function normalizePackActivationStatus(raw: unknown): PackActivationStatus {
  const rec = asRecord(raw) ?? {};
  return {
    activation_state: normalizeActivationState(
      rec.activation_state ?? rec.activationState
    ),
    active_pack_id: pickString(rec, 'active_pack_id', 'activePackId'),
    active_pack_version: pickString(rec, 'active_pack_version', 'activePackVersion'),
    active_pack_display_name: pickString(
      rec,
      'active_pack_display_name',
      'activePackDisplayName'
    ),
    enabled_at: pickString(rec, 'enabled_at', 'enabledAt'),
  };
}

function normalizePackSummary(raw: unknown): AvailablePackSummary | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const pack_id = pickString(rec, 'pack_id', 'packId');
  if (!pack_id) return null;
  const display_name = pickString(rec, 'display_name', 'displayName') ?? pack_id;
  const term_count =
    typeof rec.term_count === 'number'
      ? rec.term_count
      : typeof rec.termCount === 'number'
        ? rec.termCount
        : undefined;
  const version = pickString(rec, 'version') ?? undefined;
  const industry_relevance =
    pickString(rec, 'industry_relevance', 'industryRelevance') ?? undefined;
  return {
    ...rec,
    pack_id,
    display_name,
    term_count,
    version,
    industry_relevance,
  };
}

/** Normalize recommend payload, or wrap bare admin list arrays. */
export function normalizeListAvailablePacksResult(raw: unknown): ListAvailablePacksResult {
  if (Array.isArray(raw)) {
    return {
      all_packs: raw
        .map(normalizePackSummary)
        .filter((p): p is AvailablePackSummary => p != null),
    };
  }

  const rec = asRecord(raw) ?? {};
  const packsRaw = rec.all_packs ?? rec.allPacks ?? rec.packs ?? [];
  const all_packs = Array.isArray(packsRaw)
    ? packsRaw.map(normalizePackSummary).filter((p): p is AvailablePackSummary => p != null)
    : [];

  return {
    ...rec,
    recommended_pack_id:
      pickString(rec, 'recommended_pack_id', 'recommendedPackId') ??
      (rec.recommended_pack_id === null || rec.recommendedPackId === null ? null : undefined),
    confidence:
      typeof rec.confidence === 'string' ? rec.confidence : (rec.confidence as undefined),
    reason: pickString(rec, 'reason') ?? undefined,
    all_packs,
  };
}

export function createPacksApi(
  http: LoxtepHttpClient,
  deps: PacksApiDeps = {}
): {
  list_available: () => Promise<ListAvailablePacksResult>;
  /** MCP operation alias. */
  list_available_packs: () => Promise<ListAvailablePacksResult>;
  activate: (input: ActivateVocabularyPackInput | string) => Promise<ActivateVocabularyPackResult>;
  /** MCP operation alias. */
  activate_vocabulary_pack: (
    input: ActivateVocabularyPackInput | string
  ) => Promise<ActivateVocabularyPackResult>;
  get_activation_status: () => Promise<PackActivationStatus>;
  /** MCP operation alias. */
  get_pack_activation_status: () => Promise<PackActivationStatus>;
} {
  async function list_available(): Promise<ListAvailablePacksResult> {
    const res = await http.get('/graph/admin/vocabulary-packs/recommend');
    return normalizeListAvailablePacksResult(unwrapData(res));
  }

  async function activate(
    input: ActivateVocabularyPackInput | string
  ): Promise<ActivateVocabularyPackResult> {
    const pack_id = typeof input === 'string' ? input : input.pack_id;
    if (!pack_id) throw new Error('pack_id is required');
    const organization_id = requireOrg(
      deps,
      typeof input === 'string' ? undefined : input.organization_id
    );
    const res = await http.post(
      `/graph/admin/vocabulary-packs/${encodeURIComponent(pack_id)}/enable`,
      { organization_id }
    );
    return unwrapData<ActivateVocabularyPackResult>(res);
  }

  async function get_activation_status(): Promise<PackActivationStatus> {
    const res = await http.get('/graph/semantic-layer/activation-state');
    return normalizePackActivationStatus(unwrapData(res));
  }

  return {
    list_available,
    list_available_packs: list_available,
    activate,
    activate_vocabulary_pack: activate,
    get_activation_status,
    get_pack_activation_status: get_activation_status,
  };
}

export type PacksApi = ReturnType<typeof createPacksApi>;
