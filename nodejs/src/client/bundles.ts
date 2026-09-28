/**
 * Semantic bundles API (Phase 2).
 * MCP: import_semantic_bundle → client.meaning.bundles.import
 *
 *   POST /semantic-layer/bundles/import
 *
 * Phase 0 error contract: always surface skipped_count + errors. On HTTP
 * 207/422 (partial import), return the result with partial=true instead of
 * throwing when a parseable body is present.
 */

import { LoxtepError } from '../errors/base.js';
import type { LoxtepHttpClient } from '../http/client.js';
import type {
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
    applied_count: typeof rec.applied_count === 'number' ? rec.applied_count : 0,
    skipped_count: typeof rec.skipped_count === 'number' ? rec.skipped_count : 0,
    errors: Array.isArray(rec.errors)
      ? (rec.errors as SemanticBundleImportResult['errors'])
      : [],
    applied: Array.isArray(rec.applied)
      ? (rec.applied as SemanticBundleImportResult['applied'])
      : [],
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
} {
  return {
    async import(input: ImportSemanticBundleInput): Promise<SemanticBundleImportResult> {
      if (!input?.bundle) throw new Error('bundle is required');
      const body = {
        bundle: input.bundle,
        dry_run: input.dry_run ?? false,
      };
      try {
        const res = await http.post('/semantic-layer/bundles/import', body);
        const normalized = normalizeImportResult(res);
        if (!normalized) {
          throw new Error('Unexpected semantic bundle import response shape');
        }
        // 207 is < 400 so HTTP client returns normally; mark partial when skips exist
        if (normalized.skipped_count > 0 || normalized.errors.length > 0) {
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
  };
}

export type BundlesApi = ReturnType<typeof createBundlesApi>;
