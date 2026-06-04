import fc from 'fast-check';
import { deriveKey, normalizeContext } from './normalize';
import { emitArtifact } from './emit';
import type { WorkspaceContext } from './types';

/**
 * Feature: ai-first-platform-surface
 * Property 6: Deterministic key derivation and workspace namespace
 *
 * The Generated_SDK_Artifact SHALL export a `workspace` namespace that provides
 * dot-notation access to all Typed_Constants under a key deterministically
 * derived from each resource's name, AND SHALL export empty resource collections
 * when the project contains no resources.
 *
 * **Validates: Requirements 2.5**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary non-empty resource name (1–60 chars, mixed alphanumeric + punctuation). */
const resourceNameArb = fc.oneof(
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 _\-\.]{0,59}$/, { size: 'small' }),
  fc.stringMatching(/^[0-9][a-zA-Z0-9 _\-]{0,30}$/, { size: 'small' }),
  fc.stringMatching(/^[!@#$%^&*()]+$/, { size: 'small' }),
  fc.stringMatching(/^[a-z]+$/, { size: 'small' }),
);

/** Arbitrary resource id — a prefixed alphanumeric string with unique suffix. */
const resourceIdArb = fc.tuple(
  fc.constantFrom('dp-', 'cn-', 'dm-', 'q-', 'f-', 'w-'),
  fc.stringMatching(/^[a-z0-9]{4,12}$/, { size: 'small' }),
).map(([prefix, suffix]) => `${prefix}${suffix}`);

/** Arbitrary data product entry. */
const dataProductArb = fc.record({
  name: resourceNameArb,
  id: resourceIdArb,
  domain: fc.oneof(fc.constant(null), fc.stringMatching(/^[a-z]{3,12}$/, { size: 'small' })),
  schema: fc.constant(null),
});

/** Arbitrary connector entry. */
const connectorArb = fc.record({
  name: resourceNameArb,
  id: resourceIdArb,
  type: fc.constantFrom('shopify', 'postgres', 'stripe', 'custom'),
  connection_id: fc.oneof(fc.constant(null), fc.stringMatching(/^conn-[a-z0-9]{4,8}$/, { size: 'small' })),
});

/** Arbitrary domain entry. */
const domainArb = fc.record({
  name: resourceNameArb,
  id: resourceIdArb,
  data_product_ids: fc.array(fc.stringMatching(/^dp-[a-z0-9]{4,8}$/, { size: 'small' }), { minLength: 0, maxLength: 5 }),
});

/** Arbitrary queue/flow/workflow entry. */
const simpleResourceArb = fc.record({
  name: resourceNameArb,
  id: resourceIdArb,
});

/** Arbitrary WorkspaceContext with 0–8 resources per collection. */
const workspaceContextArb = fc.record({
  dataProducts: fc.array(dataProductArb, { minLength: 0, maxLength: 8 }),
  connectors: fc.array(connectorArb, { minLength: 0, maxLength: 8 }),
  domains: fc.array(domainArb, { minLength: 0, maxLength: 8 }),
  queues: fc.array(simpleResourceArb, { minLength: 0, maxLength: 8 }),
  flows: fc.array(simpleResourceArb, { minLength: 0, maxLength: 8 }),
  workflows: fc.array(simpleResourceArb, { minLength: 0, maxLength: 8 }),
});

/**
 * Generate a list of resources that will produce collisions (same derived key).
 * All resources share a base word, with variations in casing and punctuation.
 */
const collidingResourcesArb = fc.tuple(
  fc.stringMatching(/^[a-z]{3,10}$/, { size: 'small' }),
  fc.integer({ min: 2, max: 5 }),
).map(([baseName, count]) => {
  // Create variations that all derive to the same key
  const variations = [
    baseName,
    baseName.toUpperCase(),
    baseName.split('').join('-'),
    baseName.split('').join(' '),
    `--${baseName}--`,
  ].slice(0, count);
  return variations.map((name, i) => ({
    name,
    id: `q-${String(i).padStart(4, '0')}-${baseName}`,
  }));
});

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 6: Deterministic key derivation and workspace namespace', () => {
  it('deriveKey is deterministic: same name always produces the same key', () => {
    fc.assert(
      fc.property(resourceNameArb, (name) => {
        const key1 = deriveKey(name);
        const key2 = deriveKey(name);
        return key1 === key2;
      }),
      { numRuns: 100 },
    );
  });

  it('workspace namespace provides dot-notation access to all typed constants via derived keys', () => {
    fc.assert(
      fc.property(workspaceContextArb, (ctx) => {
        const norm = normalizeContext(ctx);
        const artifact = emitArtifact(norm);

        // The workspace namespace line must be present
        if (!artifact.includes('export const workspace = { dataProducts, connectors, domains, queues, flows, workflows } as const;')) {
          return false;
        }

        // Every normalized resource key must appear as a property in the artifact
        // (keys are either bare identifiers or quoted strings in the output)
        const allResources = [
          ...norm.dataProducts,
          ...norm.connectors,
          ...norm.domains,
          ...norm.queues,
          ...norm.flows,
          ...norm.workflows,
        ];

        for (const resource of allResources) {
          // The key appears either as `key:` (bare) or `"key":` (quoted)
          const barePattern = `${resource.key}:`;
          const quotedPattern = `"${resource.key}":`;
          if (!artifact.includes(barePattern) && !artifact.includes(quotedPattern)) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('empty resource collections produce empty objects in the workspace namespace', () => {
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        const ctx: WorkspaceContext = {
          dataProducts: [],
          connectors: [],
          domains: [],
          queues: [],
          flows: [],
          workflows: [],
        };

        const norm = normalizeContext(ctx);
        const artifact = emitArtifact(norm);

        // All collections must be empty objects
        const hasEmptyDataProducts = artifact.includes('export const dataProducts = {} as const;');
        const hasEmptyConnectors = artifact.includes('export const connectors = {} as const;');
        const hasEmptyDomains = artifact.includes('export const domains = {} as const;');
        const hasEmptyQueues = artifact.includes('export const queues = {} as const;');
        const hasEmptyFlows = artifact.includes('export const flows = {} as const;');
        const hasEmptyWorkflows = artifact.includes('export const workflows = {} as const;');

        // Workspace namespace must still be exported
        const hasWorkspace = artifact.includes(
          'export const workspace = { dataProducts, connectors, domains, queues, flows, workflows } as const;',
        );

        return (
          hasEmptyDataProducts &&
          hasEmptyConnectors &&
          hasEmptyDomains &&
          hasEmptyQueues &&
          hasEmptyFlows &&
          hasEmptyWorkflows &&
          hasWorkspace
        );
      }),
      { numRuns: 100 },
    );
  });

  it('collision resolution assigns _2, _3 suffixes in id-sorted order preserving unique keys', () => {
    fc.assert(
      fc.property(collidingResourcesArb, (resources) => {
        const ctx: WorkspaceContext = {
          dataProducts: [],
          connectors: [],
          domains: [],
          queues: resources,
          flows: [],
          workflows: [],
        };

        const norm = normalizeContext(ctx);

        // All resources in the normalized output must have unique keys
        const keys = norm.queues.map((r) => r.key);
        const uniqueKeys = new Set(keys);
        if (uniqueKeys.size !== keys.length) return false;

        // Resources are sorted by id ascending
        const ids = norm.queues.map((r) => r.data.id);
        for (let i = 1; i < ids.length; i++) {
          if (ids[i].localeCompare(ids[i - 1]) < 0) return false;
        }

        // The first resource in id order keeps the base key (no suffix)
        const sortedByIdFirst = [...resources].sort((a, b) => a.id.localeCompare(b.id));
        const firstDerivedKey = deriveKey(sortedByIdFirst[0].name);
        if (norm.queues[0].key !== firstDerivedKey) return false;

        // Subsequent collisions should have _2, _3, etc.
        let collisionCount = 0;
        for (let i = 1; i < norm.queues.length; i++) {
          const derivedBase = deriveKey(norm.queues[i].data.name);
          if (derivedBase === firstDerivedKey) {
            collisionCount++;
            const expectedKey = `${derivedBase}_${collisionCount + 1}`;
            if (norm.queues[i].key !== expectedKey) return false;
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
