/**
 * Domain shapes API (Phase 2) — org canonical schemas under semantic-layer.
 * Distinct from `client.define.schemas` (data-product schema versions).
 *
 * MCP: create_schema / list_schemas / get_schema / apply_schema / patch_schema
 * (align = patch with aligned_to_concept_uri).
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  AlignDomainShapeInput,
  ApplyDomainShapeInput,
  CreateDomainShapeInput,
  DomainShapeApplication,
  DomainShapeDetail,
  DomainShapeSummary,
  DomainShapeVersion,
  ListDomainShapesFilters,
  ListDomainShapesResult,
} from './shapes-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const SHAPES_BASE = '/semantic-layer/schemas';

function shapesBase(): string {
  return SHAPES_BASE;
}

export function createShapesApi(http: LoxtepHttpClient): {
  create: (input: CreateDomainShapeInput) => Promise<DomainShapeVersion | DomainShapeSummary>;
  list: (filters?: ListDomainShapesFilters) => Promise<ListDomainShapesResult>;
  get: (schema_id: string) => Promise<DomainShapeDetail>;
  apply: (input: ApplyDomainShapeInput) => Promise<DomainShapeApplication>;
  /** patch_schema with aligned_to_concept_uri (MCP align path). */
  align: (input: AlignDomainShapeInput) => Promise<DomainShapeSummary>;
} {
  return {
    async create(
      input: CreateDomainShapeInput
    ): Promise<DomainShapeVersion | DomainShapeSummary> {
      if (!input.name) throw new Error('name is required');
      if (!input.format) throw new Error('format is required');
      const body = {
        name: input.name,
        version: input.version ?? '1.0.0',
        format: input.format,
        definition: input.definition ?? {},
        fields: input.fields ?? [],
        domain_id: input.domain_id,
        canonical_key: input.canonical_key,
        description: input.description,
        metadata: input.metadata,
        lifecycle_state: input.lifecycle_state,
        change_propagation_policy: input.change_propagation_policy,
        aligned_to_concept_uri: input.aligned_to_concept_uri,
      };
      const res = await http.post(shapesBase(), body);
      return unwrapData<DomainShapeVersion | DomainShapeSummary>(res);
    },

    async list(filters: ListDomainShapesFilters = {}): Promise<ListDomainShapesResult> {
      const search = new URLSearchParams();
      const domain = filters.domain_id ?? filters.domain;
      if (domain) search.set('domain', domain);
      if (filters.format) search.set('format', filters.format);
      if (filters.search) search.set('search', filters.search);
      const qs = search.toString();
      const res = await http.get(`${shapesBase()}${qs ? `?${qs}` : ''}`);
      const data = unwrapData<unknown>(res);
      const rec = asRecord(data);
      // Paginated envelope: { items, pagination } or bare array / { schemas }
      if (Array.isArray(data)) {
        return { shapes: data as DomainShapeSummary[], total: data.length };
      }
      if (rec) {
        const items = Array.isArray(rec.items)
          ? (rec.items as DomainShapeSummary[])
          : Array.isArray(rec.schemas)
            ? (rec.schemas as DomainShapeSummary[])
            : Array.isArray(rec.shapes)
              ? (rec.shapes as DomainShapeSummary[])
              : [];
        const pagination = asRecord(rec.pagination);
        const total =
          typeof pagination?.total === 'number'
            ? pagination.total
            : typeof rec.total === 'number'
              ? rec.total
              : items.length;
        return { shapes: items, total };
      }
      return { shapes: [], total: 0 };
    },

    async get(schema_id: string): Promise<DomainShapeDetail> {
      if (!schema_id) throw new Error('schema_id is required');
      const res = await http.get(`${shapesBase()}/${encodeURIComponent(schema_id)}`);
      const data = unwrapData<{ schema?: DomainShapeSummary; versions?: DomainShapeVersion[] }>(
        res
      );
      return {
        schema: data.schema ?? (data as unknown as DomainShapeSummary),
        versions: data.versions ?? [],
      };
    },

    async apply(input: ApplyDomainShapeInput): Promise<DomainShapeApplication> {
      if (!input.schema_id) throw new Error('schema_id is required');
      if (!input.data_product_id) throw new Error('data_product_id is required');
      const body: Record<string, unknown> = {
        data_product_id: input.data_product_id,
      };
      if (input.schema_version_id) body.schema_version_id = input.schema_version_id;
      const res = await http.post(
        `${shapesBase()}/${encodeURIComponent(input.schema_id)}/applications`,
        body
      );
      return unwrapData<DomainShapeApplication>(res);
    },

    async align(input: AlignDomainShapeInput): Promise<DomainShapeSummary> {
      if (!input.schema_id) throw new Error('schema_id is required');
      const res = await http.put(
        `${shapesBase()}/${encodeURIComponent(input.schema_id)}`,
        { aligned_to_concept_uri: input.aligned_to_concept_uri }
      );
      return unwrapData<DomainShapeSummary>(res);
    },
  };
}

export type ShapesApi = ReturnType<typeof createShapesApi>;
