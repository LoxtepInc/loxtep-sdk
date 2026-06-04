import fc from 'fast-check';
import { compileModule } from './compiler';
import type { DataWorkflowModule, TriggerSpec } from './types';
import type { NormalizedContext } from '../codegen/types';

/**
 * Feature: ai-first-platform-surface
 * Property 13: In-place update preserves workflow identity
 *
 * When a workflow with the same name already exists in the NormalizedContext,
 * the compiled output preserves its workflow_id (targets the existing workflow)
 * rather than creating a new one.
 *
 * **Validates: Requirements 3.5**
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validTrigger: TriggerSpec = { kind: 'schedule', schedule: '0 * * * *' };
const validHandler = async () => {};

function buildModule(name: string, triggers?: TriggerSpec[]): DataWorkflowModule {
  return {
    name,
    triggers: triggers ?? [validTrigger],
    handler: validHandler,
  };
}

function buildContext(
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

/** Arbitrary valid workflow name (1–64 chars, alphanumeric + hyphens/underscores). */
const workflowNameArb = fc
  .integer({ min: 1, max: 64 })
  .map((len) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars[i % chars.length];
    }
    return result;
  });

/** Arbitrary workflow ID (simulates platform IDs like "wf_abc123"). */
const workflowIdArb = fc
  .integer({ min: 4, max: 30 })
  .map((len) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'wf_';
    for (let i = 0; i < len; i++) {
      result += chars[i % chars.length];
    }
    return result;
  });

/**
 * Smarter name + id arbitrary that generates unique pairs using a seed integer.
 * Avoids collisions by incorporating the seed.
 */
const workflowEntryArb = fc
  .tuple(
    fc.integer({ min: 1, max: 64 }),
    fc.integer({ min: 0, max: 99999 }),
  )
  .map(([nameLen, seed]) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_';
    let name = '';
    for (let i = 0; i < nameLen; i++) {
      name += chars[(i + seed) % chars.length];
    }
    const id = `wf_${seed.toString(36).padStart(4, '0')}`;
    return { name, id };
  });

/** Arbitrary trigger array (1–10 valid triggers). */
const triggersArb = fc
  .integer({ min: 1, max: 10 })
  .map((count) => Array.from({ length: count }, () => validTrigger));

/**
 * Arbitrary that produces a target workflow (name + id) plus a context containing
 * that workflow and optionally others. Ensures the target name is present in context.
 */
const contextWithTargetArb = fc
  .tuple(
    fc.integer({ min: 1, max: 40 }),
    fc.integer({ min: 100000, max: 999999 }),
    fc.array(workflowEntryArb, { minLength: 0, maxLength: 8 }),
  )
  .map(([nameLen, targetSeed, others]) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_';
    let targetName = '';
    for (let i = 0; i < nameLen; i++) {
      targetName += chars[(i + targetSeed) % chars.length];
    }
    const targetId = `wf_target_${targetSeed.toString(36)}`;

    // Remove any others that collide with the target name
    const uniqueOthers = others.filter((o) => o.name !== targetName);

    const allWorkflows = [
      { name: targetName, id: targetId },
      ...uniqueOthers,
    ];

    return { targetName, targetId, allWorkflows };
  });

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 13: In-place update preserves workflow identity', () => {
  it(
    'R3.5: when a workflow with the same name exists in context, compileModule returns its workflow_id',
    () => {
      fc.assert(
        fc.property(
          contextWithTargetArb,
          triggersArb,
          ({ targetName, targetId, allWorkflows }, triggers) => {
            const mod = buildModule(targetName, triggers);
            const ctx = buildContext(allWorkflows);
            const result = compileModule(mod, ctx);

            // The compiled workflow MUST carry the existing workflow_id
            return result.workflow_id === targetId;
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.5: when no workflow with the same name exists in context, compileModule omits workflow_id',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 40 }),
          fc.integer({ min: 0, max: 99999 }),
          fc.array(workflowEntryArb, { minLength: 0, maxLength: 8 }),
          triggersArb,
          (nameLen, seed, otherWorkflows, triggers) => {
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_';
            let moduleName = 'unique_module_';
            for (let i = 0; i < nameLen; i++) {
              moduleName += chars[(i + seed + 7) % chars.length];
            }

            // Ensure none of the context workflows share the module name
            const filtered = otherWorkflows.filter((w) => w.name !== moduleName);
            const ctx = buildContext(filtered);
            const mod = buildModule(moduleName, triggers);
            const result = compileModule(mod, ctx);

            // The compiled workflow MUST NOT carry a workflow_id
            return result.workflow_id === undefined;
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.5: the preserved workflow_id is exactly the id from context, not a generated value',
    () => {
      fc.assert(
        fc.property(
          contextWithTargetArb,
          triggersArb,
          ({ targetName, targetId, allWorkflows }, triggers) => {
            const mod = buildModule(targetName, triggers);
            const ctx = buildContext(allWorkflows);
            const result = compileModule(mod, ctx);

            // workflow_id must be a string and exactly equal the context id
            return (
              typeof result.workflow_id === 'string' &&
              result.workflow_id === targetId
            );
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.5: in-place update preserves identity regardless of trigger configuration changes',
    () => {
      fc.assert(
        fc.property(
          contextWithTargetArb,
          triggersArb,
          triggersArb,
          ({ targetName, targetId, allWorkflows }, triggers1, triggers2) => {
            const ctx = buildContext(allWorkflows);

            // Compile with two different trigger configurations
            const result1 = compileModule(buildModule(targetName, triggers1), ctx);
            const result2 = compileModule(buildModule(targetName, triggers2), ctx);

            // Both should resolve to the same existing workflow_id
            return (
              result1.workflow_id === targetId &&
              result2.workflow_id === targetId
            );
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
