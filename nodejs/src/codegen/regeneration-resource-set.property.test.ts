import fc from 'fast-check';
import { normalizeContext } from './normalize.js';
import { emitArtifact } from './emit.js';
import type { WorkspaceContext } from './types.js';

/**
 * Feature: ai-first-platform-surface
 * Property 7: Regeneration resource-set equality
 *
 * WHEN a resource is added, renamed, or removed on the attached Instance after a
 * previous generation, AND `loxtep generate` is run again, THE CLI SHALL overwrite
 * the Generated_SDK_Artifact so that it contains a typed constant for every resource
 * present in the current Workspace_Context and no typed constant for any resource
 * absent from the current Workspace_Context.
 *
 * This property verifies the pure codegen pipeline stages (`normalizeContext` →
 * `emitArtifact`) guarantee that regenerating from a modified context produces an
 * artifact whose resource set is exactly the current context — no stale references
 * from the prior generation remain, and no current resources are missing.
 *
 * **Validates: Requirements 2.6**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary non-empty resource name. */
const resourceNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{0,30}$/);

/** Arbitrary resource id with a type prefix. */
const dataProductIdArb = fc.stringMatching(/^dp_[a-z0-9]{4,12}$/);
const connectorIdArb = fc.stringMatching(/^cn_[a-z0-9]{4,12}$/);
const domainIdArb = fc.stringMatching(/^dm_[a-z0-9]{4,12}$/);
const queueIdArb = fc.stringMatching(/^q_[a-z0-9]{4,12}$/);
const flowIdArb = fc.stringMatching(/^f_[a-z0-9]{4,12}$/);
const workflowIdArb = fc.stringMatching(/^wf_[a-z0-9]{4,12}$/);

/** Arbitrary data product entry. */
const dataProductArb = fc.record({
  name: resourceNameArb,
  id: dataProductIdArb,
  domain: fc.oneof(fc.constant(null), fc.stringMatching(/^[a-z]{3,10}$/)),
  schema: fc.constant(null),
});

/** Arbitrary connector entry. */
const connectorArb = fc.record({
  type: fc.stringMatching(/^[a-z]{3,10}$/),
  id: connectorIdArb,
  connection_id: fc.oneof(fc.constant(null), fc.stringMatching(/^conn_[a-z0-9]{4,8}$/)),
  name: resourceNameArb,
});

/** Arbitrary domain entry. */
const domainArb = fc.record({
  name: resourceNameArb,
  id: domainIdArb,
  data_product_ids: fc.array(dataProductIdArb, { minLength: 0, maxLength: 3 }),
});

/** Arbitrary queue entry. */
const queueArb = fc.record({
  name: resourceNameArb,
  id: queueIdArb,
});

/** Arbitrary flow entry. */
const flowArb = fc.record({
  name: resourceNameArb,
  id: flowIdArb,
});

/** Arbitrary workflow entry. */
const workflowArb = fc.record({
  name: resourceNameArb,
  id: workflowIdArb,
});

/** Arbitrary workspace context with unique IDs within each resource type. */
const workspaceContextArb = fc.record({
  dataProducts: fc.uniqueArray(dataProductArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 8 }),
  connectors: fc.uniqueArray(connectorArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 8 }),
  domains: fc.uniqueArray(domainArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 5 }),
  queues: fc.uniqueArray(queueArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 8 }),
  flows: fc.uniqueArray(flowArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 5 }),
  workflows: fc.uniqueArray(workflowArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 5 }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts all resource IDs present in the emitted artifact source by
 * matching quoted id strings. Returns a Set of all IDs found.
 */
function extractIdsFromArtifact(artifact: string): Set<string> {
  const ids = new Set<string>();
  // Match all quoted strings that look like resource IDs (dp_, cn_, dm_, q_, f_, wf_ prefixes)
  const idPattern = /['"]((dp|cn|dm|q|f|wf)_[a-z0-9]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = idPattern.exec(artifact)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

/**
 * Extracts all resource IDs from a WorkspaceContext.
 */
function extractIdsFromContext(ctx: WorkspaceContext): Set<string> {
  const ids = new Set<string>();
  for (const dp of ctx.dataProducts) ids.add(dp.id);
  for (const c of ctx.connectors) ids.add(c.id);
  for (const d of ctx.domains) ids.add(d.id);
  for (const q of ctx.queues) ids.add(q.id);
  for (const f of ctx.flows) ids.add(f.id);
  for (const w of ctx.workflows) ids.add(w.id);
  return ids;
}

/**
 * Modifies a workspace context by applying one of: add, remove, or rename
 * to simulate a resource change between generations.
 */
type Mutation = { type: 'add' } | { type: 'remove'; index: number } | { type: 'rename'; index: number; newName: string };

const mutationArb = (maxIndex: number): fc.Arbitrary<Mutation> =>
  fc.oneof(
    fc.constant({ type: 'add' as const }),
    maxIndex > 0
      ? fc.record({ type: fc.constant('remove' as const), index: fc.integer({ min: 0, max: maxIndex - 1 }) })
      : fc.constant({ type: 'add' as const }),
    maxIndex > 0
      ? fc.record({ type: fc.constant('rename' as const), index: fc.integer({ min: 0, max: maxIndex - 1 }), newName: resourceNameArb })
      : fc.constant({ type: 'add' as const }),
  );

// ─── Property Test ────────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 7: Regeneration resource-set equality', () => {
  it(
    'regenerated artifact contains exactly the current resource set after any mutation ' +
      '(add, remove, or rename) — no stale references, no missing resources',
    () => {
      fc.assert(
        fc.property(
          workspaceContextArb,
          fc.integer({ min: 0, max: 5 }), // which resource type to mutate (0=dp, 1=conn, 2=dom, 3=queue, 4=flow, 5=wf)
          resourceNameArb, // new name for add/rename
          fc.stringMatching(/^(dp|cn|dm|q|f|wf)_[a-z0-9]{4,12}$/), // new id for adds
          (initialCtx, resourceTypeIdx, newName, newId) => {
            // Step 1: Generate artifact from initial context.
            const initialNorm = normalizeContext(initialCtx);
            const _initialArtifact = emitArtifact(initialNorm);

            // Step 2: Mutate the context to simulate a resource change.
            const mutatedCtx = structuredClone(initialCtx);
            const resourceTypes = ['dataProducts', 'connectors', 'domains', 'queues', 'flows', 'workflows'] as const;
            const targetType = resourceTypes[resourceTypeIdx];

            const collection = mutatedCtx[targetType] as Array<{ name: string; id: string; [k: string]: unknown }>;

            // Choose a mutation: if collection is empty, can only add; otherwise pick randomly based on newId
            const canRemoveOrRename = collection.length > 0;
            // Use the new id's last char to deterministically pick a mutation type
            const mutationSelector = newId.charCodeAt(newId.length - 1) % 3;

            if (!canRemoveOrRename || mutationSelector === 0) {
              // ADD: add a new resource with the given name and id
              const entry = buildNewEntry(targetType, newName, newId);
              // Only add if the id doesn't already exist
              if (!collection.some(r => r.id === newId)) {
                collection.push(entry as typeof collection[number]);
              }
            } else if (mutationSelector === 1) {
              // REMOVE: remove the last resource
              collection.pop();
            } else {
              // RENAME: rename the first resource
              collection[0].name = newName;
            }

            // Step 3: Regenerate the artifact from the mutated context.
            const mutatedNorm = normalizeContext(mutatedCtx);
            const mutatedArtifact = emitArtifact(mutatedNorm);

            // Step 4: Verify the artifact contains exactly the current resource set.
            const artifactIds = extractIdsFromArtifact(mutatedArtifact);
            const contextIds = extractIdsFromContext(mutatedCtx);

            // Every resource in the current context must appear in the artifact.
            for (const id of contextIds) {
              expect(artifactIds.has(id)).toBe(true);
            }

            // Every resource ID in the artifact must be in the current context
            // (excluding domain data_product_ids which are cross-references).
            const domainDpIds = new Set<string>();
            for (const d of mutatedCtx.domains) {
              for (const dpId of d.data_product_ids) {
                domainDpIds.add(dpId);
              }
            }

            for (const id of artifactIds) {
              const isOwnResource = contextIds.has(id);
              const isDomainCrossRef = domainDpIds.has(id);
              expect(isOwnResource || isDomainCrossRef).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  it(
    'after removing all resources of a type, the regenerated artifact has no constants for that type ' +
      '(empty collection in workspace namespace)',
    () => {
      fc.assert(
        fc.property(
          workspaceContextArb,
          fc.integer({ min: 0, max: 5 }),
          (ctx, resourceTypeIdx) => {
            const resourceTypes = ['dataProducts', 'connectors', 'domains', 'queues', 'flows', 'workflows'] as const;
            const targetType = resourceTypes[resourceTypeIdx];

            // Step 1: Generate with original context.
            const _originalArtifact = emitArtifact(normalizeContext(ctx));

            // Step 2: Remove all resources of the target type.
            const clearedCtx: WorkspaceContext = {
              ...ctx,
              [targetType]: [],
            };

            // Step 3: Regenerate.
            const clearedArtifact = emitArtifact(normalizeContext(clearedCtx));

            // Step 4: Verify no IDs from the removed type appear as resource constants.
            const removedIds = new Set(
              (ctx[targetType] as Array<{ id: string }>).map(r => r.id),
            );

            // IDs from the cleared type should NOT appear as primary resource declarations.
            // They may still appear as cross-references (e.g., data_product_ids in domains).
            const artifactIds = extractIdsFromArtifact(clearedArtifact);
            const crossRefIds = new Set<string>();
            for (const d of clearedCtx.domains) {
              for (const dpId of d.data_product_ids) {
                crossRefIds.add(dpId);
              }
            }

            for (const removedId of removedIds) {
              if (artifactIds.has(removedId) && !crossRefIds.has(removedId)) {
                // This ID should not be present as a primary resource
                expect(artifactIds.has(removedId) && !crossRefIds.has(removedId)).toBe(false);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  it(
    'after adding new resources, the regenerated artifact includes every newly added resource',
    () => {
      fc.assert(
        fc.property(
          workspaceContextArb,
          fc.uniqueArray(dataProductArb, { comparator: (a, b) => a.id === b.id, minLength: 1, maxLength: 3 }),
          fc.uniqueArray(queueArb, { comparator: (a, b) => a.id === b.id, minLength: 1, maxLength: 3 }),
          (ctx, newDataProducts, newQueues) => {
            // Step 1: Generate with original context.
            const _originalArtifact = emitArtifact(normalizeContext(ctx));

            // Step 2: Add new resources (ensuring no duplicate ids).
            const existingDpIds = new Set(ctx.dataProducts.map(dp => dp.id));
            const existingQueueIds = new Set(ctx.queues.map(q => q.id));

            const addedDps = newDataProducts.filter(dp => !existingDpIds.has(dp.id));
            const addedQueues = newQueues.filter(q => !existingQueueIds.has(q.id));

            const updatedCtx: WorkspaceContext = {
              ...ctx,
              dataProducts: [...ctx.dataProducts, ...addedDps],
              queues: [...ctx.queues, ...addedQueues],
            };

            // Step 3: Regenerate.
            const updatedArtifact = emitArtifact(normalizeContext(updatedCtx));

            // Step 4: Every added resource's id appears in the new artifact.
            const artifactIds = extractIdsFromArtifact(updatedArtifact);
            for (const dp of addedDps) {
              expect(artifactIds.has(dp.id)).toBe(true);
            }
            for (const q of addedQueues) {
              expect(artifactIds.has(q.id)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});

// ─── Helpers (continued) ──────────────────────────────────────────────────────

function buildNewEntry(
  resourceType: string,
  name: string,
  id: string,
): Record<string, unknown> {
  switch (resourceType) {
    case 'dataProducts':
      return { name, id, domain: null, schema: null };
    case 'connectors':
      return { type: 'generic', id, connection_id: null, name };
    case 'domains':
      return { name, id, data_product_ids: [] };
    case 'queues':
      return { name, id };
    case 'flows':
      return { name, id };
    case 'workflows':
      return { name, id };
    default:
      return { name, id };
  }
}
