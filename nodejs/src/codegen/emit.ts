/**
 * Stage 3: Emit — render typed TypeScript source from NormalizedContext.
 *
 * This pure function transforms a `NormalizedContext` into a string of TypeScript
 * source code containing typed `as const` constants and a `workspace` namespace
 * that aggregates all resource collections.
 *
 * Requirements: R2.1, R2.2, R2.3, R2.4, R2.5
 *
 * @module codegen/emit
 */

import type { NormalizedContext, NormalizedResource } from './types.js';

/**
 * Computes a deterministic SHA-256-like hash of the normalized context for cache
 * invalidation (R12.4). Uses a simple djb2-based hash over the JSON-serialized
 * context to produce a stable hex string.
 */
function computeContextHash(norm: NormalizedContext): string {
  const serialized = JSON.stringify(norm);
  let hash = 5381;
  for (let i = 0; i < serialized.length; i++) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Serializes a JavaScript value to a TypeScript literal string.
 * Handles strings, numbers, booleans, null, arrays, and plain objects.
 */
function toLiteral(value: unknown, indent: number): string {
  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);

  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const items = value.map((item) => `${innerPad}${toLiteral(item, indent + 1)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return '{}';
    }
    const props = entries.map(
      ([key, val]) => `${innerPad}${safeKey(key)}: ${toLiteral(val, indent + 1)}`,
    );
    return `{\n${props.join(',\n')}\n${pad}}`;
  }
  return 'undefined';
}

/**
 * Returns a safe object key — quoted if not a valid identifier, bare otherwise.
 */
function safeKey(key: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
    return key;
  }
  return JSON.stringify(key);
}

/**
 * Emits a single resource entry as a TypeScript object literal line.
 */
function emitResourceEntry(key: string, fields: Record<string, unknown>): string {
  const props = Object.entries(fields)
    .map(([k, v]) => `${safeKey(k)}: ${toLiteral(v, 2)}`)
    .join(', ');
  return `  ${safeKey(key)}: { ${props} }`;
}

/**
 * Emits a resource collection as a typed `as const` export.
 * Returns an empty object `{}` when the collection has no entries.
 */
function emitCollection<T>(
  name: string,
  resources: NormalizedResource<T>[],
  fieldExtractor: (data: T) => Record<string, unknown>,
): string {
  if (resources.length === 0) {
    return `export const ${name} = {} as const;`;
  }

  const entries = resources.map((r) => {
    const fields = fieldExtractor(r.data);
    return emitResourceEntry(r.key, fields);
  });

  return `export const ${name} = {\n${entries.join(',\n')},\n} as const;`;
}

/**
 * Renders a `NormalizedContext` into a complete TypeScript source string.
 *
 * The output includes:
 * - A header comment with an auto-generated notice and context hash (R12.4)
 * - Per-resource-type `as const` exports with required fields (R2.1–R2.4)
 * - A `workspace` namespace aggregating all collections (R2.5)
 * - Empty objects for empty collections in the workspace namespace (R2.5)
 *
 * This is a pure function: same input always produces the same output (R2.6).
 */
export function emitArtifact(norm: NormalizedContext): string {
  const hash = computeContextHash(norm);

  const header = [
    `// .loxtep/generated/index.ts  (AUTO-GENERATED — do not edit)`,
    `// Context hash: ${hash}`,
    '',
  ].join('\n');

  const dataProductsBlock = emitCollection(
    'dataProducts',
    norm.dataProducts,
    (dp) => ({
      name: dp.name,
      id: dp.id,
      domain: dp.domain,
      schema: dp.schema,
    }),
  );

  const connectorsBlock = emitCollection(
    'connectors',
    norm.connectors,
    (c) => ({
      name: c.name,
      type: c.type,
      id: c.id,
      connection_id: c.connection_id,
    }),
  );

  const domainsBlock = emitCollection(
    'domains',
    norm.domains,
    (d) => ({
      name: d.name,
      id: d.id,
      data_product_ids: d.data_product_ids,
    }),
  );

  const queuesBlock = emitCollection(
    'queues',
    norm.queues,
    (q) => ({
      name: q.name,
      id: q.id,
    }),
  );

  const flowsBlock = emitCollection(
    'flows',
    norm.flows,
    (f) => ({
      name: f.name,
      id: f.id,
    }),
  );

  const workflowsBlock = emitCollection(
    'workflows',
    norm.workflows,
    (w) => ({
      name: w.name,
      id: w.id,
    }),
  );

  const workspaceExport =
    'export const workspace = { dataProducts, connectors, domains, queues, flows, workflows } as const;';

  const parts = [
    header,
    dataProductsBlock,
    '',
    connectorsBlock,
    '',
    domainsBlock,
    '',
    queuesBlock,
    '',
    flowsBlock,
    '',
    workflowsBlock,
    '',
    workspaceExport,
    '',
  ];

  return parts.join('\n');
}
