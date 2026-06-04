/**
 * Codegen types for the typed Workspace Context generation pipeline.
 *
 * The codegen pipeline compiles the connected Loxtep resources into a single
 * typed SDK artifact at `.loxtep/generated/index.ts`. These types define the
 * intermediate representations used across the pipeline stages.
 */

/**
 * A JSON Schema representation. Matches the standard JSON Schema shape used
 * across the Loxtep platform for data product schemas.
 */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Raw workspace context fetched from the control plane.
 * Each resource collection contains the minimal fields needed for typed codegen.
 * This is the output of Stage 1 (I/O load) and input to Stage 2 (normalize).
 */
export interface WorkspaceContext {
  dataProducts: {
    name: string;
    id: string;
    domain: string | null;
    schema: JsonSchema | null;
  }[];
  connectors: {
    type: string;
    id: string;
    connection_id: string | null;
    name: string;
  }[];
  domains: {
    name: string;
    id: string;
    data_product_ids: string[];
  }[];
  queues: {
    name: string;
    id: string;
  }[];
  flows: {
    name: string;
    id: string;
  }[];
  workflows: {
    name: string;
    id: string;
  }[];
}

/**
 * A single normalized resource entry after deterministic key derivation.
 * The `key` is the stable namespace accessor (e.g. `shopify_gql_customer`).
 */
export interface NormalizedResource<T> {
  key: string;
  data: T;
}

/**
 * Normalized context after Stage 2 processing.
 * Resources are sorted by id in ascending order with deterministic keys derived
 * from resource names. This guarantees byte-identical output for unchanged contexts.
 */
export interface NormalizedContext {
  dataProducts: NormalizedResource<WorkspaceContext['dataProducts'][number]>[];
  connectors: NormalizedResource<WorkspaceContext['connectors'][number]>[];
  domains: NormalizedResource<WorkspaceContext['domains'][number]>[];
  queues: NormalizedResource<WorkspaceContext['queues'][number]>[];
  flows: NormalizedResource<WorkspaceContext['flows'][number]>[];
  workflows: NormalizedResource<WorkspaceContext['workflows'][number]>[];
}

/**
 * Per-resource-type counts reported after artifact generation.
 * Each field reports the number of typed constants written for that resource type.
 * Reports 0 for resource types with no resources (R2.7).
 */
export interface GenerateCounts {
  dataProducts: number;
  connectors: number;
  domains: number;
  queues: number;
  flows: number;
  workflows: number;
}
