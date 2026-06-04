import fc from 'fast-check';
import { normalizeContext } from './normalize.js';
import { computeCounts } from './write-artifact.js';
import type { WorkspaceContext, JsonSchema } from './types.js';

/**
 * Feature: ai-first-platform-surface
 * Property 9: Generate reports accurate counts
 *
 * For any valid WorkspaceContext (including contexts with zero resources for some
 * or all types), the counts reported by `computeCounts` (used by `writeArtifact`)
 * exactly match the number of resources in each resource type of the input.
 *
 * **Validates: Requirements 2.7**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary resource name — alphanumeric with some special chars to test derivation. */
const resourceNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 _-]{0,30}$/);

/** Arbitrary resource id. */
const resourceIdArb = fc.stringMatching(/^[a-z]{2,4}_[a-z0-9]{4,12}$/);

/** Arbitrary nullable domain string. */
const nullableDomainArb = fc.oneof(
  fc.constant(null),
  fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/),
);

/** Arbitrary nullable JSON schema. */
const nullableSchemaArb: fc.Arbitrary<JsonSchema | null> = fc.oneof(
  fc.constant(null),
  fc.record({
    type: fc.constant('object'),
    properties: fc.constant({ id: { type: 'string' } }),
  }),
);

/** Arbitrary connector type. */
const connectorTypeArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/);

/** Arbitrary nullable connection_id. */
const nullableConnectionIdArb = fc.oneof(
  fc.constant(null),
  fc.stringMatching(/^conn_[a-z0-9]{4,12}$/),
);

/** Arbitrary data product entry. */
const dataProductArb = fc.record({
  name: resourceNameArb,
  id: resourceIdArb,
  domain: nullableDomainArb,
  schema: nullableSchemaArb,
});

/** Arbitrary connector entry. */
const connectorArb = fc.record({
  name: resourceNameArb,
  type: connectorTypeArb,
  id: resourceIdArb,
  connection_id: nullableConnectionIdArb,
});

/** Arbitrary domain entry. */
const domainArb = fc.record({
  name: resourceNameArb,
  id: resourceIdArb,
  data_product_ids: fc.array(resourceIdArb, { minLength: 0, maxLength: 5 }),
});

/** Arbitrary queue entry. */
const queueArb = fc.record({
  name: resourceNameArb,
  id: resourceIdArb,
});

/** Arbitrary flow entry. */
const flowArb = fc.record({
  name: resourceNameArb,
  id: resourceIdArb,
});

/** Arbitrary workflow entry. */
const workflowArb = fc.record({
  name: resourceNameArb,
  id: resourceIdArb,
});

/**
 * Arbitrary valid WorkspaceContext with 0–8 resources per collection.
 * Uses a wider range (0–8) to stress the count invariant across empty,
 * single, and multi-resource scenarios.
 */
const workspaceContextArb: fc.Arbitrary<WorkspaceContext> = fc.record({
  dataProducts: fc.array(dataProductArb, { minLength: 0, maxLength: 8 }),
  connectors: fc.array(connectorArb, { minLength: 0, maxLength: 8 }),
  domains: fc.array(domainArb, { minLength: 0, maxLength: 8 }),
  queues: fc.array(queueArb, { minLength: 0, maxLength: 8 }),
  flows: fc.array(flowArb, { minLength: 0, maxLength: 8 }),
  workflows: fc.array(workflowArb, { minLength: 0, maxLength: 8 }),
});

// ─── Property Test ────────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 9: Generate reports accurate counts', () => {
  it(
    'R2.7: For any valid WorkspaceContext, the reported counts exactly match the number ' +
      'of resources in each type of the input (including 0 for empty types)',
    () => {
      fc.assert(
        fc.property(workspaceContextArb, (ctx) => {
          const norm = normalizeContext(ctx);
          const counts = computeCounts(norm);

          // Each count must exactly equal the length of the corresponding input array
          expect(counts.dataProducts).toBe(ctx.dataProducts.length);
          expect(counts.connectors).toBe(ctx.connectors.length);
          expect(counts.domains).toBe(ctx.domains.length);
          expect(counts.queues).toBe(ctx.queues.length);
          expect(counts.flows).toBe(ctx.flows.length);
          expect(counts.workflows).toBe(ctx.workflows.length);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R2.7: Empty resource types report a count of 0',
    () => {
      fc.assert(
        fc.property(
          // Generate a context where at least one resource type is guaranteed empty
          fc.record({
            dataProducts: fc.constant([]),
            connectors: fc.constant([]),
            domains: fc.constant([]),
            queues: fc.constant([]),
            flows: fc.constant([]),
            workflows: fc.constant([]),
          }).chain((base) =>
            // Optionally populate some types while keeping others empty
            fc.record({
              dataProducts: fc.oneof(fc.constant(base.dataProducts), fc.array(dataProductArb, { minLength: 1, maxLength: 5 })),
              connectors: fc.oneof(fc.constant(base.connectors), fc.array(connectorArb, { minLength: 1, maxLength: 5 })),
              domains: fc.oneof(fc.constant(base.domains), fc.array(domainArb, { minLength: 1, maxLength: 5 })),
              queues: fc.oneof(fc.constant(base.queues), fc.array(queueArb, { minLength: 1, maxLength: 5 })),
              flows: fc.oneof(fc.constant(base.flows), fc.array(flowArb, { minLength: 1, maxLength: 5 })),
              workflows: fc.oneof(fc.constant(base.workflows), fc.array(workflowArb, { minLength: 1, maxLength: 5 })),
            }),
          ),
          (ctx) => {
            const norm = normalizeContext(ctx);
            const counts = computeCounts(norm);

            // For every resource type that is empty in the input, the count must be 0
            if (ctx.dataProducts.length === 0) expect(counts.dataProducts).toBe(0);
            if (ctx.connectors.length === 0) expect(counts.connectors).toBe(0);
            if (ctx.domains.length === 0) expect(counts.domains).toBe(0);
            if (ctx.queues.length === 0) expect(counts.queues).toBe(0);
            if (ctx.flows.length === 0) expect(counts.flows).toBe(0);
            if (ctx.workflows.length === 0) expect(counts.workflows).toBe(0);

            // And for non-empty types, the count must match the actual length
            if (ctx.dataProducts.length > 0) expect(counts.dataProducts).toBe(ctx.dataProducts.length);
            if (ctx.connectors.length > 0) expect(counts.connectors).toBe(ctx.connectors.length);
            if (ctx.domains.length > 0) expect(counts.domains).toBe(ctx.domains.length);
            if (ctx.queues.length > 0) expect(counts.queues).toBe(ctx.queues.length);
            if (ctx.flows.length > 0) expect(counts.flows).toBe(ctx.flows.length);
            if (ctx.workflows.length > 0) expect(counts.workflows).toBe(ctx.workflows.length);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
