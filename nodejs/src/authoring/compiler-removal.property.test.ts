import fc from 'fast-check';
import { computeRemovalSet } from './compiler';
import type { NormalizedContext } from '../codegen/types';

/**
 * Feature: ai-first-platform-surface
 * Property 14: Removal targets exactly absent workflows
 *
 * The removal set computed by `computeRemovalSet` is exactly the set difference
 * between deployed workflows (in NormalizedContext) and local project module
 * names — no more, no fewer.
 *
 * **Validates: Requirements 3.7**
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNormalizedContext(
  workflows: Array<{ name: string; id: string }>,
): NormalizedContext {
  return {
    dataProducts: [],
    connectors: [],
    domains: [],
    queues: [],
    flows: [],
    workflows: workflows.map((w) => ({
      key: w.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      data: w,
    })),
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary workflow name (1–64 alphanumeric + dashes, starts with a letter). */
const workflowNameArb = fc
  .tuple(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
    fc.array(fc.constantFrom('a', 'b', 'c', '1', '2', '3', '-'), { minLength: 0, maxLength: 15 }),
  )
  .map(([first, rest]) => `${first}${rest.join('')}`);

/** Arbitrary workflow id (prefixed). */
const workflowIdArb = fc.uuid().map((u) => `wf_${u.replace(/-/g, '')}`);

/** Arbitrary workflow entry (name + id pair). */
const workflowEntryArb = fc.tuple(workflowNameArb, workflowIdArb).map(([name, id]) => ({
  name,
  id,
}));

/**
 * Arbitrary scenario: a list of deployed workflows (unique names) and a subset
 * of local module names (drawn from the deployed set + optionally extra names
 * not in the deployed set).
 */
const scenarioArb = fc
  .uniqueArray(workflowEntryArb, { minLength: 0, maxLength: 20, selector: (e) => e.name })
  .chain((deployedWorkflows) => {
    const deployedNames = deployedWorkflows.map((w) => w.name);

    // Local module names: a subset of deployed names + possible new names not on instance
    const subsetArb = fc.subarray(deployedNames, { minLength: 0 });
    const extraNamesArb = fc.array(workflowNameArb, { minLength: 0, maxLength: 5 }).map(
      (extras) => extras.filter((n) => !deployedNames.includes(n)),
    );

    return fc.tuple(subsetArb, extraNamesArb).map(([kept, extras]) => ({
      deployedWorkflows,
      localModuleNames: new Set([...kept, ...extras]),
    }));
  });

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 14: Removal targets exactly absent workflows', () => {
  it(
    'R3.7: removal set equals set difference (deployed \\ local) — no more, no fewer',
    () => {
      fc.assert(
        fc.property(scenarioArb, ({ deployedWorkflows, localModuleNames }) => {
          const ctx = buildNormalizedContext(deployedWorkflows);
          const result = computeRemovalSet(localModuleNames, ctx);

          // Expected: workflows deployed on instance but NOT in local module names
          const expectedRemovals = deployedWorkflows.filter(
            (w) => !localModuleNames.has(w.name),
          );

          // Same count — the removal set size must equal the set difference size
          expect(result.removals.length).toBe(expectedRemovals.length);

          // Every expected removal is present in the result
          for (const expected of expectedRemovals) {
            expect(result.removals).toContainEqual({
              name: expected.name,
              workflow_id: expected.id,
            });
          }

          // No extra removals beyond the expected set
          const expectedSet = new Set(expectedRemovals.map((e) => `${e.name}:${e.id}`));
          for (const removal of result.removals) {
            expect(expectedSet.has(`${removal.name}:${removal.workflow_id}`)).toBe(true);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.7: every removal emits exactly one remove_node op with the correct workflow id',
    () => {
      fc.assert(
        fc.property(scenarioArb, ({ deployedWorkflows, localModuleNames }) => {
          const ctx = buildNormalizedContext(deployedWorkflows);
          const result = computeRemovalSet(localModuleNames, ctx);

          // Each removal should have a corresponding remove_node op
          expect(result.removals.length).toBe(result.ops.length);

          for (const removal of result.removals) {
            expect(result.ops).toContainEqual({
              op: 'remove_node',
              entity_id: removal.workflow_id,
            });
          }

          // All ops are remove_node ops
          for (const op of result.ops) {
            expect(op.op).toBe('remove_node');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.7: workflows present in both deployed and local are never removed',
    () => {
      fc.assert(
        fc.property(scenarioArb, ({ deployedWorkflows, localModuleNames }) => {
          const ctx = buildNormalizedContext(deployedWorkflows);
          const result = computeRemovalSet(localModuleNames, ctx);

          // No workflow that is in the local set should appear in removals
          for (const removal of result.removals) {
            expect(localModuleNames.has(removal.name)).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.7: local-only modules (not deployed) produce no removal ops',
    () => {
      fc.assert(
        fc.property(scenarioArb, ({ deployedWorkflows, localModuleNames }) => {
          const ctx = buildNormalizedContext(deployedWorkflows);
          const result = computeRemovalSet(localModuleNames, ctx);

          const deployedNames = new Set(deployedWorkflows.map((w) => w.name));

          // Local modules not on the instance should not cause any removal
          for (const localName of localModuleNames) {
            if (!deployedNames.has(localName)) {
              const found = result.removals.some((r) => r.name === localName);
              expect(found).toBe(false);
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
