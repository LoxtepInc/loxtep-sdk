/**
 * Stage 2: Normalize — deterministic key derivation + canonical ordering.
 *
 * This pure function transforms a raw `WorkspaceContext` into a `NormalizedContext`
 * with stable, deterministic keys and canonical id-sorted ordering, ensuring
 * byte-identical output for unchanged contexts (R2.6).
 *
 * @module codegen/normalize
 */

import type { WorkspaceContext, NormalizedContext, NormalizedResource } from './types.js';

/**
 * Derives a deterministic, valid TypeScript identifier key from a resource name.
 *
 * Rules:
 * 1. Lowercase the name
 * 2. Replace any run of non-alphanumeric characters with a single `_`
 * 3. Trim leading/trailing `_`
 * 4. If result is empty or starts with a digit, prefix with `_`
 *
 * Collision resolution is handled separately in `normalizeCollection`.
 */
export function deriveKey(name: string): string {
  // Step 1: lowercase
  let key = name.toLowerCase();

  // Step 2: replace any run of non-alphanumeric characters with a single `_`
  key = key.replace(/[^a-z0-9]+/g, '_');

  // Step 3: trim leading/trailing `_`
  key = key.replace(/^_+|_+$/g, '');

  // Step 4: if empty or starts with a digit, prefix with `_`
  if (key === '' || /^[0-9]/.test(key)) {
    key = '_' + key;
  }

  return key;
}

/**
 * Normalizes a single resource collection:
 * - Sorts resources by `id` in ascending lexicographic order (canonical ordering)
 * - Derives a key from each resource's `name`
 * - Resolves collisions by appending `_2`, `_3`, etc. in id-sorted order
 *   (the first resource in id order keeps the base key, subsequent collisions get suffixes)
 */
function normalizeCollection<T extends { name: string; id: string }>(
  resources: T[],
): NormalizedResource<T>[] {
  // Sort by id ascending for canonical ordering
  const sorted = [...resources].sort((a, b) => a.id.localeCompare(b.id));

  // Group by derived base key to detect collisions
  const keyGroups = new Map<string, number>();

  return sorted.map((resource) => {
    const baseKey = deriveKey(resource.name);

    // Track how many times we've seen this base key
    const count = keyGroups.get(baseKey) ?? 0;
    keyGroups.set(baseKey, count + 1);

    // First occurrence keeps the base key; subsequent get _2, _3, etc.
    const key = count === 0 ? baseKey : `${baseKey}_${count + 1}`;

    return { key, data: resource };
  });
}

/**
 * Normalizes the entire workspace context.
 *
 * Transforms raw `WorkspaceContext` into `NormalizedContext` by:
 * - Sorting each resource collection by id (ascending) for canonical ordering
 * - Deriving deterministic keys from resource names
 * - Resolving key collisions with `_2`, `_3`, … suffixes in id-sorted order
 *
 * This is a pure function: given the same input, it always produces the same output,
 * guaranteeing byte-identical artifacts for unchanged contexts (R2.6).
 */
export function normalizeContext(ctx: WorkspaceContext): NormalizedContext {
  return {
    dataProducts: normalizeCollection(ctx.dataProducts),
    connectors: normalizeCollection(ctx.connectors),
    domains: normalizeCollection(ctx.domains),
    queues: normalizeCollection(ctx.queues),
    flows: normalizeCollection(ctx.flows),
    workflows: normalizeCollection(ctx.workflows),
  };
}
