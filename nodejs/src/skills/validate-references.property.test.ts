/**
 * Property 21: Generate validates skill references against the Workspace_Context
 *
 * fast-check under Jest, ≥100 runs
 *
 * **Validates: Requirements 5.8, 5.9**
 *
 * Tagged: Feature: ai-first-platform-surface, Property 21: Generate validates skill references against the Workspace_Context
 *
 * This property test verifies that for arbitrary skill scopes with references
 * not present in the workspace context, all missing identifiers are reported
 * with the skill name.
 */

import * as fc from 'fast-check';
import { validateSkillReferences } from './validate-references';
import type { SkillDefinition, SkillScope } from './types';
import type { WorkspaceContext } from '../codegen/types';

// --- Arbitraries ---

/** Generate a valid resource name (non-empty alphanumeric + underscores) */
const resourceNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,30}$/);

/** Generate a unique array of resource names */
const uniqueResourceNamesArb = (minLength = 0, maxLength = 10) =>
  fc.uniqueArray(resourceNameArb, { minLength, maxLength });

/** Generate a WorkspaceContext with known resource names */
const workspaceContextArb = fc.record({
  dataProducts: fc.uniqueArray(
    fc.record({
      name: resourceNameArb,
      id: fc.stringMatching(/^dp_[a-z0-9]{4,8}$/),
      domain: fc.option(fc.stringMatching(/^[a-z]{3,10}$/), { nil: null }),
      schema: fc.constant(null),
    }),
    { minLength: 0, maxLength: 8, selector: (r) => r.name }
  ),
  connectors: fc.uniqueArray(
    fc.record({
      type: fc.stringMatching(/^[a-z]{3,10}$/),
      id: fc.stringMatching(/^cn_[a-z0-9]{4,8}$/),
      connection_id: fc.option(fc.stringMatching(/^conn_[a-z0-9]{4,8}$/), { nil: null }),
      name: resourceNameArb,
    }),
    { minLength: 0, maxLength: 8, selector: (r) => r.name }
  ),
  domains: fc.uniqueArray(
    fc.record({
      name: resourceNameArb,
      id: fc.stringMatching(/^dm_[a-z0-9]{4,8}$/),
      data_product_ids: fc.array(fc.stringMatching(/^dp_[a-z0-9]{4,8}$/), { minLength: 0, maxLength: 3 }),
    }),
    { minLength: 0, maxLength: 8, selector: (r) => r.name }
  ),
  queues: fc.uniqueArray(
    fc.record({
      name: resourceNameArb,
      id: fc.stringMatching(/^q_[a-z0-9]{4,8}$/),
    }),
    { minLength: 0, maxLength: 8, selector: (r) => r.name }
  ),
  flows: fc.uniqueArray(
    fc.record({
      name: resourceNameArb,
      id: fc.stringMatching(/^fl_[a-z0-9]{4,8}$/),
    }),
    { minLength: 0, maxLength: 8, selector: (r) => r.name }
  ),
  workflows: fc.uniqueArray(
    fc.record({
      name: resourceNameArb,
      id: fc.stringMatching(/^wf_[a-z0-9]{4,8}$/),
    }),
    { minLength: 0, maxLength: 8, selector: (r) => r.name }
  ),
}) as fc.Arbitrary<WorkspaceContext>;

/** The resource type keys on SkillScope */
const RESOURCE_TYPES: (keyof SkillScope)[] = [
  'data_products',
  'connectors',
  'workflows',
  'domains',
  'queues',
];

/** Map from SkillScope key to WorkspaceContext key */
const SCOPE_TO_CONTEXT: Record<keyof SkillScope, keyof WorkspaceContext> = {
  data_products: 'dataProducts',
  connectors: 'connectors',
  workflows: 'workflows',
  domains: 'domains',
  queues: 'queues',
};

/**
 * Generate a skill scope that deliberately includes some identifiers NOT in the
 * workspace context, so we can verify they are reported.
 */
function skillScopeWithMissingRefsArb(context: WorkspaceContext): fc.Arbitrary<{
  scope: SkillScope;
  expectedMissing: { resourceType: keyof SkillScope; missingIdentifier: string }[];
}> {
  // For each resource type, we pick some names from the context (valid) and some
  // names that are guaranteed NOT in the context (invalid/missing).
  const perTypeArbs = RESOURCE_TYPES.map((rt) => {
    const contextKey = SCOPE_TO_CONTEXT[rt];
    const availableNames = (context[contextKey] as { name: string }[]).map((r) => r.name);
    const availableSet = new Set(availableNames);

    // Generate "missing" names that do NOT appear in context
    const missingNamesArb = fc.uniqueArray(
      resourceNameArb.filter((n) => !availableSet.has(n)),
      { minLength: 0, maxLength: 4 }
    );

    // Pick a subset of available names (valid refs)
    const validSubsetArb =
      availableNames.length > 0
        ? fc.subarray(availableNames, { minLength: 0 })
        : fc.constant([] as string[]);

    return fc.tuple(validSubsetArb, missingNamesArb).map(([validNames, missingNames]) => ({
      resourceType: rt,
      refs: [...validNames, ...missingNames],
      missing: missingNames,
    }));
  });

  return fc.tuple(...perTypeArbs).map((perType) => {
    const scope: SkillScope = {};
    const expectedMissing: { resourceType: keyof SkillScope; missingIdentifier: string }[] = [];

    for (const { resourceType, refs, missing } of perType) {
      if (refs.length > 0) {
        scope[resourceType] = refs;
      }
      for (const m of missing) {
        expectedMissing.push({ resourceType, missingIdentifier: m });
      }
    }

    return { scope, expectedMissing };
  });
}

/** Generate a skill name */
const skillNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/);

// --- Tests ---

describe('Property 21: Generate validates skill references against the Workspace_Context', () => {
  it('every missing identifier is reported with the correct skill name (R5.8, R5.9)', () => {
    fc.assert(
      fc.property(
        workspaceContextArb,
        fc.array(skillNameArb, { minLength: 1, maxLength: 5 }),
        (context, skillNames) => {
          // Deduplicate skill names
          const uniqueSkillNames = [...new Set(skillNames)];
          if (uniqueSkillNames.length === 0) return;

          // Generate scopes with known missing refs for each skill
          // We do this deterministically from the context
          const skills = new Map<string, SkillDefinition>();
          const allExpectedMissing: {
            skillName: string;
            resourceType: keyof SkillScope;
            missingIdentifier: string;
          }[] = [];

          for (const name of uniqueSkillNames) {
            // Create a scope that references something not in context
            // Use a name guaranteed not to be in any context collection
            const missingId = `__missing_${name}_ref`;
            const scope: SkillScope = {
              data_products: [missingId],
            };

            skills.set(name, {
              name,
              scope,
              permissions: { data_products: ['read'] },
            });

            // We know this identifier is missing (it starts with __ so won't match our arb)
            allExpectedMissing.push({
              skillName: name,
              resourceType: 'data_products',
              missingIdentifier: missingId,
            });
          }

          const result = validateSkillReferences(skills, context);

          // Must be invalid since all skills reference missing resources
          expect(result.valid).toBe(false);
          if (!result.valid) {
            // Every expected missing reference must appear in the errors
            for (const expected of allExpectedMissing) {
              const found = result.errors.some(
                (e) =>
                  e.skillName === expected.skillName &&
                  e.resourceType === expected.resourceType &&
                  e.missingIdentifier === expected.missingIdentifier
              );
              expect(found).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('identifiers present in the context are never reported as missing', () => {
    fc.assert(
      fc.property(
        workspaceContextArb,
        skillNameArb,
        (context, skillName) => {
          // Build a scope using ONLY identifiers that exist in the context
          const scope: SkillScope = {};
          for (const rt of RESOURCE_TYPES) {
            const contextKey = SCOPE_TO_CONTEXT[rt];
            const available = (context[contextKey] as { name: string }[]).map((r) => r.name);
            if (available.length > 0) {
              scope[rt] = available;
            }
          }

          const skills = new Map<string, SkillDefinition>();
          skills.set(skillName, {
            name: skillName,
            scope,
            permissions: {},
          });

          const result = validateSkillReferences(skills, context);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all missing identifiers across all resource types are reported with the skill name', () => {
    fc.assert(
      fc.property(
        workspaceContextArb.chain((ctx) =>
          fc.tuple(
            fc.constant(ctx),
            skillNameArb,
            skillScopeWithMissingRefsArb(ctx)
          )
        ),
        ([context, skillName, { scope, expectedMissing }]) => {
          const skills = new Map<string, SkillDefinition>();
          skills.set(skillName, {
            name: skillName,
            scope,
            permissions: {},
          });

          const result = validateSkillReferences(skills, context);

          if (expectedMissing.length === 0) {
            // No missing refs → should be valid
            expect(result.valid).toBe(true);
          } else {
            // Missing refs → must be invalid and report all of them
            expect(result.valid).toBe(false);
            if (!result.valid) {
              // Every expected missing identifier must be in the errors
              for (const expected of expectedMissing) {
                const found = result.errors.some(
                  (e) =>
                    e.skillName === skillName &&
                    e.resourceType === expected.resourceType &&
                    e.missingIdentifier === expected.missingIdentifier
                );
                expect(found).toBe(true);
              }

              // Every reported error must actually correspond to a missing identifier
              for (const error of result.errors) {
                expect(error.skillName).toBe(skillName);
                const contextKey = SCOPE_TO_CONTEXT[error.resourceType];
                const available = new Set(
                  (context[contextKey] as { name: string }[]).map((r) => r.name)
                );
                expect(available.has(error.missingIdentifier)).toBe(false);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
