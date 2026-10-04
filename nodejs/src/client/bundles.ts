/**
 * Semantic bundles API (Phase 2 + package stage cutover).
 * MCP: import_semantic_bundle → client.meaning.bundles.import
 * MCP: export_semantic_bundle → client.meaning.bundles.export
 *
 *   POST /semantic-layer/bundles/import
 *   GET  /semantic-layer/bundles/export
 *
 * Default import activation is stage (package + approval). Phase 0 error
 * contract: always surface skipped_count + errors. On HTTP 207/422 (partial
 * import), return the result with partial=true instead of throwing when a
 * parseable body is present.
 */

import { LoxtepError } from '../errors/base.js';
import type { LoxtepHttpClient } from '../http/client.js';
import type {
  ExportSemanticBundleQuery,
  ImportSemanticBundleInput,
  SemanticBundleImportResult,
} from './bundles-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeImportResult(
  raw: unknown,
  opts?: { partial?: boolean; status_code?: number }
): SemanticBundleImportResult | null {
  const data = unwrapData<unknown>(raw);
  const rec = asRecord(data);
  if (!rec) return null;
  if (
    typeof rec.applied_count !== 'number' &&
    typeof rec.skipped_count !== 'number' &&
    !Array.isArray(rec.errors) &&
    !Array.isArray(rec.applied)
  ) {
    // Might be nested under another envelope
    const nested = asRecord(rec.data);
    if (nested) return normalizeImportResult(nested, opts);
    return null;
  }
  return {
    dry_run: Boolean(rec.dry_run),
    activation:
      rec.activation === 'stage' || rec.activation === 'deploy'
        ? rec.activation
        : undefined,
    applied_count: typeof rec.applied_count === 'number' ? rec.applied_count : 0,
    skipped_count: typeof rec.skipped_count === 'number' ? rec.skipped_count : 0,
    errors: Array.isArray(rec.errors)
      ? (rec.errors as SemanticBundleImportResult['errors'])
      : [],
    applied: Array.isArray(rec.applied)
      ? (rec.applied as SemanticBundleImportResult['applied'])
      : [],
    loss_report: Array.isArray(rec.loss_report)
      ? (rec.loss_report as SemanticBundleImportResult['loss_report'])
      : [],
    package:
      rec.package && typeof rec.package === 'object'
        ? (rec.package as SemanticBundleImportResult['package'])
        : undefined,
    plan:
      rec.plan && typeof rec.plan === 'object'
        ? (rec.plan as Record<string, unknown>)
        : undefined,
    partial: opts?.partial,
    status_code: opts?.status_code,
  };
}

function tryResultFromError(err: LoxtepError): SemanticBundleImportResult | null {
  const status = err.status_code;
  if (status !== 207 && status !== 422) return null;
  // Prefer full body fragments if the platform put the result on details / message payload
  const fromDetails = normalizeImportResult(err.details, {
    partial: true,
    status_code: status,
  });
  if (fromDetails) return fromDetails;
  return null;
}

export function createBundlesApi(http: LoxtepHttpClient): {
  import: (input: ImportSemanticBundleInput) => Promise<SemanticBundleImportResult>;
  export: (query?: ExportSemanticBundleQuery) => Promise<Record<string, unknown>>;
} {
  return {
    async import(input: ImportSemanticBundleInput): Promise<SemanticBundleImportResult> {
      if (!input?.bundle) throw new Error('bundle is required');
      const body = {
        bundle: input.bundle,
        dry_run: input.dry_run ?? false,
        ...(input.activation ? { activation: input.activation } : {}),
        ...(input.package_id ? { package_id: input.package_id } : {}),
        ...(input.package_label ? { package_label: input.package_label } : {}),
      };
      try {
        const res = await http.post('/semantic-layer/bundles/import', body);
        const normalized = normalizeImportResult(res);
        if (!normalized) {
          throw new Error('Unexpected semantic bundle import response shape');
        }
        // Staged packages / dry_run plans are success even with plan skips.
        if (normalized.dry_run || normalized.activation === 'stage' || normalized.package) {
          return normalized;
        }
        const hasLoss = (normalized.loss_report?.length ?? 0) > 0;
        if (normalized.skipped_count > 0 || normalized.errors.length > 0 || hasLoss) {
          return { ...normalized, partial: true };
        }
        return normalized;
      } catch (err) {
        if (err instanceof LoxtepError) {
          const fromErr = tryResultFromError(err);
          if (fromErr) return fromErr;
        }
        throw err;
      }
    },
    async export(query: ExportSemanticBundleQuery = {}): Promise<Record<string, unknown>> {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      const path = `/semantic-layer/bundles/export${qs.toString() ? `?${qs}` : ''}`;
      const res = await http.get(path);
      return unwrapData<Record<string, unknown>>(res);
    },
  };
}

export type BundlesApi = ReturnType<typeof createBundlesApi>;
