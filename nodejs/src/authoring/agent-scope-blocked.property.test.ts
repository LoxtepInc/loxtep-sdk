import fc from 'fast-check';
import {
  createScopeGuardedToolbox,
  computeReachableScope,
  ActionTrace,
  AgentScopeError,
} from './agent';
import type { SkillDefinition, SkillScope, Operation } from '../skills/types';
import type { Toolbox } from './toolbox';

/**
 * Feature: ai-first-platform-surface
 * Property 17: Out-of-scope reach is blocked before any platform call and recorded
 *
 * For arbitrary out-of-scope resource access attempts, the scope-guarded toolbox:
 * 1. Blocks the attempt before any platform call (mock client call count stays at 0)
 * 2. Terminates the operation with an error identifying the denied resource
 * 3. Records the blocked attempt in the action trace
 *
 * **Validates: Requirements 4.4**
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RESOURCE_TYPES: (keyof SkillScope)[] = [
  'data_products',
  'connectors',
  'workflows',
  'domains',
  'queues',
];

const OPERATIONS: Operation[] = ['read', 'write', 'create', 'delete'];

/**
 * Create a mock toolbox that tracks call counts.
 * Each method increments a counter so we can assert no platform call is made.
 */
function createMockToolbox(): { toolbox: Toolbox; callCount: () => number } {
  let calls = 0;

  const toolbox: Toolbox = {
    dataProducts: {
      write: async () => { calls++; return { success: true as const, events_written: 1 }; },
      query: async () => { calls++; return { items: [], metadata: {} as any }; },
      get: async () => { calls++; return {} as any; },
      list: async () => { calls++; return []; },
    },
    queues: {
      write: async () => { calls++; },
      getMetadata: async () => { calls++; return { queue_name: 'test' }; },
    },
    connections: {
      list: async () => { calls++; return []; },
      get: async () => { calls++; return {} as any; },
      test: async () => { calls++; return {} as any; },
    },
    workflows: {
      list: async () => { calls++; return []; },
      getGraph: async () => { calls++; return {} as any; },
    },
  };

  return { toolbox, callCount: () => calls };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary resource ID. */
const resourceIdArb = fc.stringMatching(/^[a-z]{2}_[a-z0-9]{1,12}$/, { size: 'small' });

/** Arbitrary non-empty list of in-scope resource IDs (1–5 entries). */
const inScopeListArb = fc.array(resourceIdArb, { minLength: 1, maxLength: 5 });

/**
 * Arbitrary out-of-scope resource ID — guaranteed NOT to be in any provided list.
 * We use a prefix 'oos_' that will never match `^[a-z]{2}_[a-z0-9]{1,12}$` if the
 * in-scope IDs are short enough to not collide.
 */
const outOfScopeIdArb = fc
  .stringMatching(/^[a-z]{3,8}$/, { size: 'small' })
  .map(s => `oos_${s}_x`);

/** Arbitrary skill definition with a known scope. */
const skillWithScopeArb = (inScopeIds: Record<keyof SkillScope, string[]>): fc.Arbitrary<SkillDefinition> =>
  fc.constant({
    name: 'test-skill',
    scope: inScopeIds,
    permissions: {
      data_products: ['read', 'write'] as Operation[],
      connectors: ['read'] as Operation[],
      workflows: ['read'] as Operation[],
      domains: ['read'] as Operation[],
      queues: ['read', 'write'] as Operation[],
    },
  });

/**
 * Generates a scenario with:
 * - A skill definition with defined in-scope resources
 * - An out-of-scope resource ID guaranteed not to be in any scope list
 * - A resource type and operation for the out-of-scope access
 */
const outOfScopeScenarioArb = fc.record({
  inScopeDataProducts: inScopeListArb,
  inScopeConnectors: inScopeListArb,
  inScopeWorkflows: inScopeListArb,
  inScopeDomains: inScopeListArb,
  inScopeQueues: inScopeListArb,
  outOfScopeId: outOfScopeIdArb,
  targetResourceType: fc.constantFrom(...RESOURCE_TYPES),
  targetOperation: fc.constantFrom(...OPERATIONS),
}).filter(scenario => {
  // Ensure the out-of-scope ID is truly not in the corresponding scope list
  const scopeMap: Record<keyof SkillScope, string[]> = {
    data_products: scenario.inScopeDataProducts,
    connectors: scenario.inScopeConnectors,
    workflows: scenario.inScopeWorkflows,
    domains: scenario.inScopeDomains,
    queues: scenario.inScopeQueues,
  };
  return !scopeMap[scenario.targetResourceType].includes(scenario.outOfScopeId);
});

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 17: Out-of-scope reach is blocked before any platform call and recorded', () => {
  it(
    'R4.4: out-of-scope resource access is blocked BEFORE any platform call (mock call count stays at 0)',
    () => {
      fc.assert(
        fc.property(outOfScopeScenarioArb, (scenario) => {
          const scopeMap: SkillScope = {
            data_products: scenario.inScopeDataProducts,
            connectors: scenario.inScopeConnectors,
            workflows: scenario.inScopeWorkflows,
            domains: scenario.inScopeDomains,
            queues: scenario.inScopeQueues,
          };

          const skillDef: SkillDefinition = {
            name: 'test-skill',
            scope: scopeMap,
            permissions: {
              data_products: ['read', 'write', 'create', 'delete'],
              connectors: ['read', 'write', 'create', 'delete'],
              workflows: ['read', 'write', 'create', 'delete'],
              domains: ['read', 'write', 'create', 'delete'],
              queues: ['read', 'write', 'create', 'delete'],
            },
          };

          const mergedSkill = computeReachableScope([skillDef]);
          const { toolbox, callCount } = createMockToolbox();
          const trace = new ActionTrace();
          const guarded = createScopeGuardedToolbox(toolbox, mergedSkill, trace);

          // Attempt an out-of-scope resource access via the guarded toolbox
          let threw = false;
          try {
            // Use the appropriate toolbox method based on target resource type
            switch (scenario.targetResourceType) {
              case 'data_products':
                // Synchronous — guardCall throws before the async call
                guarded.dataProducts.get({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
              case 'connectors':
                guarded.connections.get(scenario.outOfScopeId);
                break;
              case 'workflows':
                guarded.workflows.getGraph({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
              case 'queues':
                guarded.queues.getMetadata({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
              case 'domains':
                // domains don't have a direct toolbox method; use data_products with domain filtering
                // The guard fires on any scope-checked call. Use dataProducts.get with an out-of-scope ID
                guarded.dataProducts.get({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
            }
          } catch (e) {
            threw = true;
          }

          // The operation MUST have been blocked (threw) and no platform call was made
          return threw && callCount() === 0;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.4: the error identifies the denied resource',
    () => {
      fc.assert(
        fc.property(outOfScopeScenarioArb, (scenario) => {
          const scopeMap: SkillScope = {
            data_products: scenario.inScopeDataProducts,
            connectors: scenario.inScopeConnectors,
            workflows: scenario.inScopeWorkflows,
            domains: scenario.inScopeDomains,
            queues: scenario.inScopeQueues,
          };

          const skillDef: SkillDefinition = {
            name: 'test-skill',
            scope: scopeMap,
            permissions: {
              data_products: ['read', 'write', 'create', 'delete'],
              connectors: ['read', 'write', 'create', 'delete'],
              workflows: ['read', 'write', 'create', 'delete'],
              domains: ['read', 'write', 'create', 'delete'],
              queues: ['read', 'write', 'create', 'delete'],
            },
          };

          const mergedSkill = computeReachableScope([skillDef]);
          const { toolbox } = createMockToolbox();
          const trace = new ActionTrace();
          const guarded = createScopeGuardedToolbox(toolbox, mergedSkill, trace);

          let caughtError: unknown = null;
          try {
            switch (scenario.targetResourceType) {
              case 'data_products':
                guarded.dataProducts.get({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
              case 'connectors':
                guarded.connections.get(scenario.outOfScopeId);
                break;
              case 'workflows':
                guarded.workflows.getGraph({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
              case 'queues':
                guarded.queues.getMetadata({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
              case 'domains':
                guarded.dataProducts.get({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
            }
          } catch (e) {
            caughtError = e;
          }

          // Must be an AgentScopeError identifying the denied resource
          if (!(caughtError instanceof AgentScopeError)) return false;
          // The denied resource must contain the out-of-scope ID
          return caughtError.deniedResource.includes(scenario.outOfScopeId);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.4: the blocked attempt is recorded in the action trace',
    () => {
      fc.assert(
        fc.property(outOfScopeScenarioArb, (scenario) => {
          const scopeMap: SkillScope = {
            data_products: scenario.inScopeDataProducts,
            connectors: scenario.inScopeConnectors,
            workflows: scenario.inScopeWorkflows,
            domains: scenario.inScopeDomains,
            queues: scenario.inScopeQueues,
          };

          const skillDef: SkillDefinition = {
            name: 'test-skill',
            scope: scopeMap,
            permissions: {
              data_products: ['read', 'write', 'create', 'delete'],
              connectors: ['read', 'write', 'create', 'delete'],
              workflows: ['read', 'write', 'create', 'delete'],
              domains: ['read', 'write', 'create', 'delete'],
              queues: ['read', 'write', 'create', 'delete'],
            },
          };

          const mergedSkill = computeReachableScope([skillDef]);
          const { toolbox } = createMockToolbox();
          const trace = new ActionTrace();
          const guarded = createScopeGuardedToolbox(toolbox, mergedSkill, trace);

          try {
            switch (scenario.targetResourceType) {
              case 'data_products':
                guarded.dataProducts.get({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
              case 'connectors':
                guarded.connections.get(scenario.outOfScopeId);
                break;
              case 'workflows':
                guarded.workflows.getGraph({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
              case 'queues':
                guarded.queues.getMetadata({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
              case 'domains':
                guarded.dataProducts.get({ id: scenario.outOfScopeId, name: scenario.outOfScopeId });
                break;
            }
          } catch {
            // Expected — we just need to verify the trace
          }

          // The trace must contain a blocked-attempt entry
          const entries = trace.getEntries();
          if (entries.length === 0) return false;

          // Find the blocked entry
          const blockedEntry = entries.find(e => e.outcome === 'blocked');
          if (!blockedEntry) return false;

          // It must reference the denied resource
          if (!blockedEntry.targetResource?.includes(scenario.outOfScopeId)) return false;

          // It must have a scope_check kind
          if (blockedEntry.kind !== 'scope_check') return false;

          // It must have an error message containing scope violation info
          if (!blockedEntry.error || !blockedEntry.error.includes('SCOPE_VIOLATION')) return false;

          // It must have a valid operation name indicating it was blocked
          if (!blockedEntry.operationName.startsWith('blocked:')) return false;

          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.4: in-scope resource access is NOT blocked (positive case — no false positives)',
    () => {
      fc.assert(
        fc.property(
          inScopeListArb,
          fc.constantFrom('read' as Operation, 'write' as Operation),
          (inScopeIds, operation) => {
            // Pick one in-scope resource ID for data_products
            const targetId = inScopeIds[0];

            const skillDef: SkillDefinition = {
              name: 'test-skill',
              scope: {
                data_products: inScopeIds,
                connectors: inScopeIds,
                workflows: inScopeIds,
                domains: inScopeIds,
                queues: inScopeIds,
              },
              permissions: {
                data_products: ['read', 'write', 'create', 'delete'],
                connectors: ['read', 'write', 'create', 'delete'],
                workflows: ['read', 'write', 'create', 'delete'],
                domains: ['read', 'write', 'create', 'delete'],
                queues: ['read', 'write', 'create', 'delete'],
              },
            };

            const mergedSkill = computeReachableScope([skillDef]);
            const { toolbox, callCount } = createMockToolbox();
            const trace = new ActionTrace();
            const guarded = createScopeGuardedToolbox(toolbox, mergedSkill, trace);

            // In-scope access should NOT throw synchronously (the guard passes)
            let threw = false;
            try {
              // Call get — the guardCall is synchronous; the actual async call
              // returns a promise, but we just need to verify the guard didn't throw
              guarded.dataProducts.get({ id: targetId, name: targetId });
            } catch (e) {
              if (e instanceof AgentScopeError) {
                threw = true;
              }
              // Other errors (like the mock resolving) are fine
            }

            // The scope guard must NOT have blocked this in-scope access
            return !threw;
          }
        ),
        { numRuns: 100 },
      );
    },
  );
});
