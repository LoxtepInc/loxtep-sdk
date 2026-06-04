/**
 * Property 20: Skill scope decision is fail-closed
 *
 * For arbitrary skill definitions, resource types, resource identifiers, and
 * operations, `checkScope` denies by default: an unlisted resource type is
 * denied, an unlisted resource id is denied, an unlisted operation is denied,
 * an unknown skill (undefined) is denied, and any internal error during
 * validation blocks the operation.
 *
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6**
 *
 * Tagged: Feature: ai-first-platform-surface, Property 20: Skill scope decision is fail-closed
 */

import fc from 'fast-check';
import { checkScope, checkScopeByName } from './check-scope';
import type { SkillDefinition, SkillScope, Operation, ScopeDecision } from './types';

/* ------------------------------------------------------------------ */
/*  Arbitraries                                                       */
/* ------------------------------------------------------------------ */

const RESOURCE_TYPES: (keyof SkillScope)[] = [
  'data_products',
  'connectors',
  'workflows',
  'domains',
  'queues',
];

const OPERATIONS: Operation[] = ['read', 'write', 'create', 'delete'];

/** Arbitrary resource type. */
const resourceTypeArb = fc.constantFrom(...RESOURCE_TYPES);

/** Arbitrary operation. */
const operationArb = fc.constantFrom(...OPERATIONS);

/** Arbitrary resource id (alphanumeric + underscore prefix). */
const resourceIdArb = fc.stringMatching(/^[a-z]{2}_[a-z0-9_]{1,20}$/, { size: 'small' });

/** Arbitrary non-empty list of resource ids. */
const resourceIdListArb = fc.array(resourceIdArb, { minLength: 1, maxLength: 10 });

/** Arbitrary subset of operations (possibly empty). */
const operationSubsetArb = fc.subarray(OPERATIONS, { minLength: 0, maxLength: 4 });

/** Arbitrary non-empty subset of operations. */
const nonEmptyOperationSubsetArb = fc.subarray(OPERATIONS, { minLength: 1, maxLength: 4 });

/** Arbitrary skill definition with controlled scope and permissions. */
const skillDefinitionArb = fc.record({
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

/** Arbitrary skill name for the checkScopeByName path. */
const skillNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,20}$/, { size: 'small' });

/* ------------------------------------------------------------------ */
/*  Property 20: Skill scope decision is fail-closed                  */
/* ------------------------------------------------------------------ */

describe('Feature: ai-first-platform-surface, Property 20: Skill scope decision is fail-closed', () => {
  it('undefined skill always returns UNKNOWN_SKILL (R5.6)', () => {
    fc.assert(
      fc.property(
        resourceTypeArb,
        resourceIdArb,
        operationArb,
        (resourceType, resourceId, operation) => {
          const result = checkScope(undefined, resourceType, resourceId, operation);
          expect(result.allowed).toBe(false);
          expect(result).toHaveProperty('code', 'UNKNOWN_SKILL');
        }
      ),
      { numRuns: 100 },
    );
  });

  it('resource id not in scope always returns SCOPE_VIOLATION (R5.4)', () => {
    fc.assert(
      fc.property(
        skillDefinitionArb,
        resourceTypeArb,
        resourceIdArb,
        operationArb,
        (skill, resourceType, resourceId, operation) => {
          // Precondition: the resource id is NOT in the scope for this type
          const scopeList = skill.scope[resourceType];
          fc.pre(!scopeList || !scopeList.includes(resourceId));

          const result = checkScope(skill, resourceType, resourceId, operation);
          expect(result.allowed).toBe(false);
          expect(result).toHaveProperty('code', 'SCOPE_VIOLATION');
        }
      ),
      { numRuns: 100 },
    );
  });

  it('resource type with no scope entries denies access (R5.2, R5.4)', () => {
    fc.assert(
      fc.property(
        skillDefinitionArb,
        resourceTypeArb,
        resourceIdArb,
        operationArb,
        (skill, resourceType, resourceId, operation) => {
          // Force the scope for this resource type to be undefined
          const modifiedSkill: SkillDefinition = {
            ...skill,
            scope: { ...skill.scope, [resourceType]: undefined },
          };

          const result = checkScope(modifiedSkill, resourceType, resourceId, operation);
          expect(result.allowed).toBe(false);
          expect(result).toHaveProperty('code', 'SCOPE_VIOLATION');
        }
      ),
      { numRuns: 100 },
    );
  });

  it('operation not in permissions always returns OPERATION_DENIED (R5.2, R5.5)', () => {
    fc.assert(
      fc.property(
        skillDefinitionArb,
        resourceTypeArb,
        operationArb,
        (skill, resourceType, operation) => {
          // Put a resource in scope so we get past the scope check
          const testResourceId = 'dp_test_resource_xyz';
          const modifiedSkill: SkillDefinition = {
            ...skill,
            scope: { ...skill.scope, [resourceType]: [testResourceId] },
          };

          // Ensure the operation is NOT in permissions for this resource type
          const perms = modifiedSkill.permissions[resourceType];
          fc.pre(!perms || !perms.includes(operation));

          const result = checkScope(modifiedSkill, resourceType, testResourceId, operation);
          expect(result.allowed).toBe(false);
          expect(result).toHaveProperty('code', 'OPERATION_DENIED');
        }
      ),
      { numRuns: 100 },
    );
  });

  it('resource type with no permissions entry denies the operation (R5.2, R5.5)', () => {
    fc.assert(
      fc.property(
        skillDefinitionArb,
        resourceTypeArb,
        operationArb,
        (skill, resourceType, operation) => {
          // Put a resource in scope, but remove permissions for the resource type
          const testResourceId = 'dp_no_perms_resource';
          const modifiedSkill: SkillDefinition = {
            ...skill,
            scope: { ...skill.scope, [resourceType]: [testResourceId] },
            permissions: { ...skill.permissions, [resourceType]: undefined },
          };

          const result = checkScope(modifiedSkill, resourceType, testResourceId, operation);
          expect(result.allowed).toBe(false);
          expect(result).toHaveProperty('code', 'OPERATION_DENIED');
        }
      ),
      { numRuns: 100 },
    );
  });

  it('internal error during scope validation returns SCOPE_VALIDATION_FAILED (R5.3)', () => {
    fc.assert(
      fc.property(
        resourceTypeArb,
        resourceIdArb,
        operationArb,
        (resourceType, resourceId, operation) => {
          // Construct a skill that throws during property access (simulates internal error)
          const throwingSkill = {
            name: 'broken-skill',
            scope: new Proxy({} as SkillScope, {
              get() { throw new Error('unexpected internal failure'); },
            }),
            permissions: {},
          } as SkillDefinition;

          const result = checkScope(throwingSkill, resourceType, resourceId, operation);
          expect(result.allowed).toBe(false);
          expect(result).toHaveProperty('code', 'SCOPE_VALIDATION_FAILED');
        }
      ),
      { numRuns: 100 },
    );
  });

  it('only explicitly scoped + permitted combinations are allowed (R5.2, R5.3)', () => {
    fc.assert(
      fc.property(
        skillDefinitionArb,
        resourceTypeArb,
        resourceIdArb,
        operationArb,
        (skill, resourceType, resourceId, operation) => {
          const result = checkScope(skill, resourceType, resourceId, operation);

          if (result.allowed) {
            // If allowed, the resource MUST be in scope AND the operation MUST be permitted
            const scopeList = skill.scope[resourceType];
            expect(scopeList).toBeDefined();
            expect(scopeList).toContain(resourceId);

            const perms = skill.permissions[resourceType];
            expect(perms).toBeDefined();
            expect(perms).toContain(operation);
          } else {
            // If denied, at least one condition must be violated
            expect(result.allowed).toBe(false);
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  it('unknown skill name via checkScopeByName returns UNKNOWN_SKILL (R5.6)', () => {
    fc.assert(
      fc.property(
        skillDefinitionArb,
        skillNameArb,
        skillNameArb,
        resourceTypeArb,
        resourceIdArb,
        operationArb,
        (skill, registeredName, lookupName, resourceType, resourceId, operation) => {
          // Ensure the lookup name is NOT the registered name
          fc.pre(lookupName !== registeredName);

          const skills = new Map<string, SkillDefinition>();
          skills.set(registeredName, skill);

          const result = checkScopeByName(skills, lookupName, resourceType, resourceId, operation);
          expect(result.allowed).toBe(false);
          expect(result).toHaveProperty('code', 'UNKNOWN_SKILL');
        }
      ),
      { numRuns: 100 },
    );
  });
});
