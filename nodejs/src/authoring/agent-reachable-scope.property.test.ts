import fc from 'fast-check';
import { computeReachableScope } from './agent';
import type { SkillDefinition, SkillScope, Operation } from '../skills/types';

/**
 * Feature: ai-first-platform-surface
 * Property 16: Agentic reachable set equals union of skill scopes
 *
 * The reachable resource set for an agentic operation is exactly the union of
 * all scope.data_products + scope.connectors + scope.workflows + scope.domains +
 * scope.queues across the supplied skills — no more, no fewer.
 *
 * **Validates: Requirements 4.3**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary resource ID (non-empty alphanumeric + underscore prefix). */
const resourceIdArb = fc.stringMatching(/^[a-z]{2}_[a-z0-9_]{1,15}$/, { size: 'small' });

/** Arbitrary non-empty list of resource ids (0–8 entries). */
const resourceIdListArb = fc.array(resourceIdArb, { minLength: 0, maxLength: 8 });

/** Arbitrary subset of operations. */
const operationSubsetArb = fc.subarray(
  ['read', 'write', 'create', 'delete'] as Operation[],
  { minLength: 0, maxLength: 4 }
);

/** Arbitrary SkillDefinition with a random scope and permissions. */
const skillDefinitionArb: fc.Arbitrary<SkillDefinition> = fc.record({
  name: fc.stringMatching(/^[a-z][a-z0-9-]{1,20}$/, { size: 'small' }),
  scope: fc.record({
    data_products: fc.option(resourceIdListArb, { nil: undefined }),
    connectors: fc.option(resourceIdListArb, { nil: undefined }),
    workflows: fc.option(resourceIdListArb, { nil: undefined }),
    domains: fc.option(resourceIdListArb, { nil: undefined }),
    queues: fc.option(resourceIdListArb, { nil: undefined }),
  }) as fc.Arbitrary<SkillScope>,
  permissions: fc.record({
    data_products: fc.option(operationSubsetArb, { nil: undefined }),
    connectors: fc.option(operationSubsetArb, { nil: undefined }),
    workflows: fc.option(operationSubsetArb, { nil: undefined }),
    domains: fc.option(operationSubsetArb, { nil: undefined }),
    queues: fc.option(operationSubsetArb, { nil: undefined }),
  }) as fc.Arbitrary<Partial<Record<keyof SkillScope, Operation[]>>>,
}) as fc.Arbitrary<SkillDefinition>;

/** Arbitrary list of 1–10 skill definitions. */
const skillsListArb = fc.array(skillDefinitionArb, { minLength: 1, maxLength: 10 });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCOPE_KEYS: (keyof SkillScope)[] = [
  'data_products',
  'connectors',
  'workflows',
  'domains',
  'queues',
];

/**
 * Compute the expected union of all scope entries for a resource type across skills.
 * Deduplicates entries (since the reachable set is a set, not a multiset).
 */
function expectedUnion(skills: SkillDefinition[], key: keyof SkillScope): string[] {
  const set = new Set<string>();
  for (const skill of skills) {
    const entries = skill.scope[key];
    if (entries) {
      for (const entry of entries) {
        set.add(entry);
      }
    }
  }
  return Array.from(set).sort();
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 16: Agentic reachable set equals union of skill scopes', () => {
  it(
    'R4.3: the reachable set for each resource type equals the deduplicated union of all skill scopes — no more, no fewer',
    () => {
      fc.assert(
        fc.property(skillsListArb, (skills) => {
          const merged = computeReachableScope(skills);

          for (const key of SCOPE_KEYS) {
            const expected = expectedUnion(skills, key);
            const actual = [...(merged.scope[key] ?? [])].sort();

            // Exact equality: same elements, no extra, no missing
            if (actual.length !== expected.length) return false;
            for (let i = 0; i < actual.length; i++) {
              if (actual[i] !== expected[i]) return false;
            }
          }
          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.3: every resource in any single skill scope is reachable in the merged scope',
    () => {
      fc.assert(
        fc.property(skillsListArb, (skills) => {
          const merged = computeReachableScope(skills);

          for (const skill of skills) {
            for (const key of SCOPE_KEYS) {
              const entries = skill.scope[key];
              if (entries) {
                for (const entry of entries) {
                  if (!merged.scope[key]?.includes(entry)) {
                    return false;
                  }
                }
              }
            }
          }
          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.3: the merged scope contains no resource not present in at least one skill scope',
    () => {
      fc.assert(
        fc.property(skillsListArb, (skills) => {
          const merged = computeReachableScope(skills);

          for (const key of SCOPE_KEYS) {
            const mergedEntries = merged.scope[key] ?? [];
            for (const entry of mergedEntries) {
              // This entry must appear in at least one skill's scope for this key
              const existsInSomeSkill = skills.some(
                (s) => s.scope[key]?.includes(entry) ?? false
              );
              if (!existsInSomeSkill) return false;
            }
          }
          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.3: the merged scope has no duplicates within any resource type',
    () => {
      fc.assert(
        fc.property(skillsListArb, (skills) => {
          const merged = computeReachableScope(skills);

          for (const key of SCOPE_KEYS) {
            const entries = merged.scope[key] ?? [];
            const unique = new Set(entries);
            if (unique.size !== entries.length) return false;
          }
          return true;
        }),
        { numRuns: 100 },
      );
    },
  );
});
