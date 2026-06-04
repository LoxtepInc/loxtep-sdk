import fc from 'fast-check';
import { normalizeContext } from './normalize.js';
import { emitArtifact } from './emit.js';
import type { WorkspaceContext } from './types.js';

/**
 * Feature: ai-first-platform-surface
 * Property 8: Regeneration determinism (byte-identical)
 *
 * The codegen pipeline SHALL produce a byte-identical Generated_SDK_Artifact when
 * run again against an unchanged Workspace_Context. This verifies that the pure
 * stages (`normalizeContext` → `emitArtifact`) are fully deterministic — calling
 * them twice with the same input produces exactly the same output string.
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

/** Arbitrary JSON schema (nullable). */
const jsonSchemaArb = fc.oneof(
  fc.constant(null),
  fc.record({
    type: fc.constantFrom('string', 'number', 'object', 'array', 'boolean'),
    properties: fc.constant(undefined),
  }),
);

/** Arbitrary data product entry. */
const dataProductArb = fc.record({
  name: resourceNameArb,
  id: dataProductIdArb,
  domain: fc.oneof(fc.constant(null), fc.stringMatching(/^[a-z]{3,10}$/)),
  schema: jsonSchemaArb,
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
const workspaceContextArb: fc.Arbitrary<WorkspaceContext> = fc.record({
  dataProducts: fc.uniqueArray(dataProductArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 8 }),
  connectors: fc.uniqueArray(connectorArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 8 }),
  domains: fc.uniqueArray(domainArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 5 }),
  queues: fc.uniqueArray(queueArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 8 }),
  flows: fc.uniqueArray(flowArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 5 }),
  workflows: fc.uniqueArray(workflowArb, { comparator: (a, b) => a.id === b.id, minLength: 0, maxLength: 5 }),
});

// ─── Property Test ────────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 8: Regeneration determinism (byte-identical)', () => {
  it(
    'calling normalizeContext then emitArtifact twice on the same WorkspaceContext produces byte-identical output',
    () => {
      fc.assert(
        fc.property(workspaceContextArb, (ctx) => {
          // Run the pure pipeline twice on the same input
          const normalized1 = normalizeContext(ctx);
          const artifact1 = emitArtifact(normalized1);

          const normalized2 = normalizeContext(ctx);
          const artifact2 = emitArtifact(normalized2);

          // The two outputs must be byte-identical (string equality)
          expect(artifact1).toBe(artifact2);
        }),
        { numRuns: 100 },
      );
    },
    30_000,
  );

  it(
    'reordering resources in the input context still produces the same artifact (canonical ordering)',
    () => {
      fc.assert(
        fc.property(
          workspaceContextArb,
          fc.infiniteStream(fc.boolean()),
          (ctx, shuffleStream) => {
            // Create a shuffled version of the context
            const shuffled: WorkspaceContext = {
              dataProducts: shuffleArray([...ctx.dataProducts], shuffleStream),
              connectors: shuffleArray([...ctx.connectors], shuffleStream),
              domains: shuffleArray([...ctx.domains], shuffleStream),
              queues: shuffleArray([...ctx.queues], shuffleStream),
              flows: shuffleArray([...ctx.flows], shuffleStream),
              workflows: shuffleArray([...ctx.workflows], shuffleStream),
            };

            // Both should produce the same artifact
            const artifact1 = emitArtifact(normalizeContext(ctx));
            const artifact2 = emitArtifact(normalizeContext(shuffled));

            expect(artifact1).toBe(artifact2);
          },
        ),
        { numRuns: 100 },
      );
    },
    30_000,
  );

  it(
    'the intermediate NormalizedContext is also identical across runs',
    () => {
      fc.assert(
        fc.property(workspaceContextArb, (ctx) => {
          const normalized1 = normalizeContext(ctx);
          const normalized2 = normalizeContext(ctx);

          // Deep equality of the normalized context
          expect(JSON.stringify(normalized1)).toBe(JSON.stringify(normalized2));
        }),
        { numRuns: 100 },
      );
    },
    30_000,
  );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shuffles an array using a deterministic stream of booleans from fast-check.
 * Uses a simple Fisher-Yates variant driven by the boolean stream.
 */
function shuffleArray<T>(arr: T[], stream: fc.Stream<boolean>): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    // Use the boolean stream to decide swap direction
    const shouldSwap = stream.next();
    if (shouldSwap.done) break;
    if (shouldSwap.value) {
      const j = i - 1;
      [result[i], result[j]] = [result[j], result[i]];
    }
  }
  return result;
}
