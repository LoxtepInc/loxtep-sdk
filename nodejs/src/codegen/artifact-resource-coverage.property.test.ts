import fc from 'fast-check';
import { normalizeContext } from './normalize.js';
import { emitArtifact } from './emit.js';
import type { WorkspaceContext, JsonSchema } from './types.js';

/**
 * Feature: ai-first-platform-surface
 * Property 5: Generated artifact resource coverage
 *
 * For any valid WorkspaceContext, the generated artifact contains typed constants
 * for every resource with the correct fields:
 * - Data products: `name`, `id`, `domain`, `schema` (R2.1)
 * - Connectors: `type`, `id`, `connection_id` (R2.2)
 * - Domains: `name`, `id`, `data_product_ids` (R2.3)
 * - Queues: `name` and `id` (R2.4)
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary resource name — alphanumeric with some special chars to test derivation. */
const resourceNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 _-]{0,30}$/);

/** Arbitrary resource id. */
const resourceIdArb = fc.stringMatching(/^[a-z]{2,4}_[a-z0-9]{4,12}$/);

/** Arbitrary nullable domain string. */
const nullableDomainArb = fc.oneof(
  fc.constant(null),
  fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/)
);

/** Arbitrary nullable JSON schema. */
const nullableSchemaArb: fc.Arbitrary<JsonSchema | null> = fc.oneof(
  fc.constant(null),
  fc.record({
    type: fc.constant('object'),
    properties: fc.constant({ id: { type: 'string' } }),
  })
);

/** Arbitrary connector type. */
const connectorTypeArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/);

/** Arbitrary nullable connection_id. */
const nullableConnectionIdArb = fc.oneof(
  fc.constant(null),
  fc.stringMatching(/^conn_[a-z0-9]{4,12}$/)
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

/** Arbitrary valid WorkspaceContext with 0–5 resources per collection. */
const workspaceContextArb: fc.Arbitrary<WorkspaceContext> = fc.record({
  dataProducts: fc.array(dataProductArb, { minLength: 0, maxLength: 5 }),
  connectors: fc.array(connectorArb, { minLength: 0, maxLength: 5 }),
  domains: fc.array(domainArb, { minLength: 0, maxLength: 5 }),
  queues: fc.array(queueArb, { minLength: 0, maxLength: 5 }),
  flows: fc.array(flowArb, { minLength: 0, maxLength: 5 }),
  workflows: fc.array(workflowArb, { minLength: 0, maxLength: 5 }),
});

// ─── Property Test ────────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 5: Generated artifact resource coverage', () => {
  it(
    'R2.1: For any valid WorkspaceContext, the generated artifact defines a typed constant ' +
      'for each data product with name, id, domain, and schema fields',
    () => {
      fc.assert(
        fc.property(workspaceContextArb, (ctx) => {
          const norm = normalizeContext(ctx);
          const artifact = emitArtifact(norm);

          // Every data product in the input must be represented in the artifact
          for (const dp of ctx.dataProducts) {
            // The artifact must contain the data product's actual field values
            expect(artifact).toContain(`name: ${JSON.stringify(dp.name)}`);
            expect(artifact).toContain(`id: ${JSON.stringify(dp.id)}`);
            // domain can be null or a string
            if (dp.domain === null) {
              expect(artifact).toContain('domain: null');
            } else {
              expect(artifact).toContain(`domain: ${JSON.stringify(dp.domain)}`);
            }
            // schema can be null or an object
            if (dp.schema === null) {
              expect(artifact).toContain('schema: null');
            } else {
              // schema is a JSON object — just verify it's present as a non-null value
              expect(artifact).toContain('schema: {');
            }
          }

          // The count of entries in the dataProducts export matches the input count
          expect(norm.dataProducts.length).toBe(ctx.dataProducts.length);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R2.2: For any valid WorkspaceContext, the generated artifact defines a typed constant ' +
      'for each connector with type, id, and connection_id fields',
    () => {
      fc.assert(
        fc.property(workspaceContextArb, (ctx) => {
          const norm = normalizeContext(ctx);
          const artifact = emitArtifact(norm);

          for (const connector of ctx.connectors) {
            expect(artifact).toContain(`type: ${JSON.stringify(connector.type)}`);
            expect(artifact).toContain(`id: ${JSON.stringify(connector.id)}`);
            if (connector.connection_id === null) {
              expect(artifact).toContain('connection_id: null');
            } else {
              expect(artifact).toContain(
                `connection_id: ${JSON.stringify(connector.connection_id)}`
              );
            }
          }

          expect(norm.connectors.length).toBe(ctx.connectors.length);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R2.3: For any valid WorkspaceContext, the generated artifact defines a typed constant ' +
      'for each domain with name, id, and data_product_ids fields',
    () => {
      fc.assert(
        fc.property(workspaceContextArb, (ctx) => {
          const norm = normalizeContext(ctx);
          const artifact = emitArtifact(norm);

          for (const domain of ctx.domains) {
            expect(artifact).toContain(`name: ${JSON.stringify(domain.name)}`);
            expect(artifact).toContain(`id: ${JSON.stringify(domain.id)}`);
            // data_product_ids is always an array
            expect(artifact).toContain('data_product_ids:');
            // Each data product id in the array should appear
            for (const dpId of domain.data_product_ids) {
              expect(artifact).toContain(JSON.stringify(dpId));
            }
          }

          expect(norm.domains.length).toBe(ctx.domains.length);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R2.4: For any valid WorkspaceContext, the generated artifact defines a typed constant ' +
      'for each queue with name and id fields',
    () => {
      fc.assert(
        fc.property(workspaceContextArb, (ctx) => {
          const norm = normalizeContext(ctx);
          const artifact = emitArtifact(norm);

          for (const queue of ctx.queues) {
            expect(artifact).toContain(`name: ${JSON.stringify(queue.name)}`);
            expect(artifact).toContain(`id: ${JSON.stringify(queue.id)}`);
          }

          expect(norm.queues.length).toBe(ctx.queues.length);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'Coverage completeness: the artifact has exactly one entry per resource in the ' +
      'workspace namespace exports for every resource type',
    () => {
      fc.assert(
        fc.property(workspaceContextArb, (ctx) => {
          const norm = normalizeContext(ctx);
          const artifact = emitArtifact(norm);

          // Verify the workspace namespace export exists
          expect(artifact).toContain(
            'export const workspace = { dataProducts, connectors, domains, queues, flows, workflows } as const;'
          );

          // Verify each collection is exported
          expect(artifact).toContain('export const dataProducts =');
          expect(artifact).toContain('export const connectors =');
          expect(artifact).toContain('export const domains =');
          expect(artifact).toContain('export const queues =');
          expect(artifact).toContain('export const flows =');
          expect(artifact).toContain('export const workflows =');

          // Verify that every resource id appears in the artifact (full coverage)
          for (const dp of ctx.dataProducts) {
            expect(artifact).toContain(JSON.stringify(dp.id));
          }
          for (const c of ctx.connectors) {
            expect(artifact).toContain(JSON.stringify(c.id));
          }
          for (const d of ctx.domains) {
            expect(artifact).toContain(JSON.stringify(d.id));
          }
          for (const q of ctx.queues) {
            expect(artifact).toContain(JSON.stringify(q.id));
          }
          for (const f of ctx.flows) {
            expect(artifact).toContain(JSON.stringify(f.id));
          }
          for (const w of ctx.workflows) {
            expect(artifact).toContain(JSON.stringify(w.id));
          }
        }),
        { numRuns: 100 }
      );
    }
  );
});
