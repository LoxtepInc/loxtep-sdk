import fc from 'fast-check';
import {
  ActionTrace,
  createScopeGuardedToolbox,
  computeReachableScope,
} from './agent';
import type { ActionTraceEntry } from './agent';
import type { Toolbox } from './toolbox';
import type { SkillDefinition, SkillScope, Operation } from '../skills/types';

/**
 * Feature: ai-first-platform-surface
 * Property 18: Action trace is per-operation, ordered, and complete
 *
 * When a handler combines Deterministic_Operations and Agentic_Operations,
 * the SDK records each operation as a separate action-trace entry ordered by
 * execution start time. Each entry contains all required fields: operation name,
 * target resource, outcome, and timestamp. No operations are missing.
 *
 * **Validates: Requirements 4.5, 7.1**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary resource ID. */
const resourceIdArb = fc.stringMatching(/^[a-z]{2}_[a-z0-9_]{1,12}$/, { size: 'small' });

/** Arbitrary resource name for data products / queues. */
const resourceNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/, { size: 'small' });

/** Arbitrary operation outcome. */
const outcomeArb = fc.constantFrom('succeeded', 'failed') as fc.Arbitrary<'succeeded' | 'failed'>;

/**
 * Describes a single operation to be executed through the guarded toolbox.
 */
interface OperationSpec {
  kind: 'dataProducts.write' | 'dataProducts.query' | 'dataProducts.get' | 'queues.write' | 'queues.getMetadata' | 'connections.list' | 'workflows.list';
  resourceName: string;
  resourceId: string;
  shouldSucceed: boolean;
}

/** Arbitrary operation spec for generating a sequence of operations. */
const operationSpecArb: fc.Arbitrary<OperationSpec> = fc.record({
  kind: fc.constantFrom(
    'dataProducts.write',
    'dataProducts.query',
    'dataProducts.get',
    'queues.write',
    'queues.getMetadata',
    'connections.list',
    'workflows.list'
  ) as fc.Arbitrary<OperationSpec['kind']>,
  resourceName: resourceNameArb,
  resourceId: resourceIdArb,
  shouldSucceed: fc.boolean(),
});

/** Arbitrary list of 1–10 operations to execute. */
const operationSequenceArb = fc.array(operationSpecArb, { minLength: 1, maxLength: 10 });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a mock toolbox that succeeds or fails per-operation based on the spec.
 */
function createMockToolbox(operations: OperationSpec[]): Toolbox {
  let callIndex = 0;

  function getOutcome(): boolean {
    const op = operations[callIndex];
    callIndex++;
    return op?.shouldSucceed ?? true;
  }

  return {
    dataProducts: {
      async write(_ref, _event) {
        if (!getOutcome()) throw new Error('write failed');
        return { success: true as const, events_written: 1 };
      },
      async query(_ref, _sql) {
        if (!getOutcome()) throw new Error('query failed');
        return { items: [], metadata: {} as any };
      },
      async get(_ref) {
        if (!getOutcome()) throw new Error('get failed');
        return { id: 'dp_1', name: 'test' } as any;
      },
      async list(_filters?) {
        if (!getOutcome()) throw new Error('list failed');
        return [];
      },
    },
    queues: {
      async write(_ref, _event) {
        if (!getOutcome()) throw new Error('queue write failed');
      },
      async getMetadata(_ref) {
        if (!getOutcome()) throw new Error('getMetadata failed');
        return { queue_name: 'test' };
      },
    },
    connections: {
      async list() {
        if (!getOutcome()) throw new Error('connections list failed');
        return [];
      },
      async get(_id) {
        if (!getOutcome()) throw new Error('connection get failed');
        return {} as any;
      },
      async test(_id) {
        if (!getOutcome()) throw new Error('connection test failed');
        return {} as any;
      },
    },
    workflows: {
      async list() {
        if (!getOutcome()) throw new Error('workflows list failed');
        return [];
      },
      async getGraph(_ref) {
        if (!getOutcome()) throw new Error('getGraph failed');
        return {} as any;
      },
    },
  };
}

/**
 * Build a permissive skill that allows all resources referenced in the operation sequence.
 */
function buildPermissiveSkill(operations: OperationSpec[]): SkillDefinition {
  const dataProducts = new Set<string>();
  const queues = new Set<string>();
  const connectors = new Set<string>();
  const workflows = new Set<string>();

  for (const op of operations) {
    if (op.kind.startsWith('dataProducts')) {
      dataProducts.add(op.resourceName);
    } else if (op.kind.startsWith('queues')) {
      queues.add(op.resourceName);
    } else if (op.kind.startsWith('connections')) {
      connectors.add(op.resourceId);
    } else if (op.kind.startsWith('workflows')) {
      workflows.add(op.resourceName);
    }
  }

  return {
    name: 'test-permissive',
    scope: {
      data_products: Array.from(dataProducts),
      queues: Array.from(queues),
      connectors: Array.from(connectors),
      workflows: Array.from(workflows),
      domains: [],
    },
    permissions: {
      data_products: ['read', 'write', 'create', 'delete'],
      queues: ['read', 'write', 'create', 'delete'],
      connectors: ['read', 'write', 'create', 'delete'],
      workflows: ['read', 'write', 'create', 'delete'],
    },
  };
}

/**
 * Execute a sequence of operations against the guarded toolbox, collecting results.
 */
async function executeOperations(
  guardedToolbox: Toolbox,
  operations: OperationSpec[]
): Promise<void> {
  for (const op of operations) {
    try {
      switch (op.kind) {
        case 'dataProducts.write':
          await guardedToolbox.dataProducts.write(
            { id: op.resourceId, name: op.resourceName },
            { payload: 'test' }
          );
          break;
        case 'dataProducts.query':
          await guardedToolbox.dataProducts.query(
            { id: op.resourceId, name: op.resourceName },
            'SELECT 1'
          );
          break;
        case 'dataProducts.get':
          await guardedToolbox.dataProducts.get(
            { id: op.resourceId, name: op.resourceName }
          );
          break;
        case 'queues.write':
          await guardedToolbox.queues.write(
            { id: op.resourceId, name: op.resourceName },
            { payload: 'test' }
          );
          break;
        case 'queues.getMetadata':
          await guardedToolbox.queues.getMetadata(
            { id: op.resourceId, name: op.resourceName }
          );
          break;
        case 'connections.list':
          await guardedToolbox.connections.list();
          break;
        case 'workflows.list':
          await guardedToolbox.workflows.list();
          break;
      }
    } catch {
      // Operations may fail — that's expected; the trace records failures.
    }
  }
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 18: Action trace is per-operation, ordered, and complete', () => {
  it(
    'R4.5: each operation produces exactly one trace entry',
    () => {
      fc.assert(
        fc.asyncProperty(operationSequenceArb, async (operations) => {
          const skill = buildPermissiveSkill(operations);
          const mergedSkill = computeReachableScope([skill]);
          const trace = new ActionTrace();
          const mockToolbox = createMockToolbox(operations);
          const guardedToolbox = createScopeGuardedToolbox(mockToolbox, mergedSkill, trace);

          await executeOperations(guardedToolbox, operations);

          const entries = trace.getEntries();
          // Filter to toolbox entries only (exclude scope_check entries if any)
          const toolboxEntries = entries.filter(e => e.kind === 'toolbox');

          // Each operation should produce exactly one trace entry
          return toolboxEntries.length === operations.length;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.5: trace entries are ordered by execution start time (monotonically increasing sequence)',
    () => {
      fc.assert(
        fc.asyncProperty(operationSequenceArb, async (operations) => {
          const skill = buildPermissiveSkill(operations);
          const mergedSkill = computeReachableScope([skill]);
          const trace = new ActionTrace();
          const mockToolbox = createMockToolbox(operations);
          const guardedToolbox = createScopeGuardedToolbox(mockToolbox, mergedSkill, trace);

          await executeOperations(guardedToolbox, operations);

          const entries = trace.getEntries();
          const toolboxEntries = entries.filter(e => e.kind === 'toolbox');

          // Sequence numbers are strictly increasing
          for (let i = 1; i < toolboxEntries.length; i++) {
            if (toolboxEntries[i].seq <= toolboxEntries[i - 1].seq) return false;
          }

          // startedAt timestamps are non-decreasing (operations execute sequentially)
          for (let i = 1; i < toolboxEntries.length; i++) {
            if (toolboxEntries[i].startedAt < toolboxEntries[i - 1].startedAt) return false;
          }

          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R7.1: each trace entry contains all required fields (operationName, targetResource or undefined for list ops, outcome, timestamps)',
    () => {
      fc.assert(
        fc.asyncProperty(operationSequenceArb, async (operations) => {
          const skill = buildPermissiveSkill(operations);
          const mergedSkill = computeReachableScope([skill]);
          const trace = new ActionTrace();
          const mockToolbox = createMockToolbox(operations);
          const guardedToolbox = createScopeGuardedToolbox(mockToolbox, mergedSkill, trace);

          await executeOperations(guardedToolbox, operations);

          const entries = trace.getEntries();
          const toolboxEntries = entries.filter(e => e.kind === 'toolbox');

          for (const entry of toolboxEntries) {
            // operationName must be a non-empty string
            if (typeof entry.operationName !== 'string' || entry.operationName.length === 0) {
              return false;
            }

            // outcome must be one of the valid values
            if (!['succeeded', 'failed', 'blocked'].includes(entry.outcome)) {
              return false;
            }

            // startedAt must be a valid ISO 8601 UTC timestamp
            if (typeof entry.startedAt !== 'string' || isNaN(Date.parse(entry.startedAt))) {
              return false;
            }

            // completedAt must be a valid ISO 8601 UTC timestamp
            if (typeof entry.completedAt !== 'string' || isNaN(Date.parse(entry.completedAt))) {
              return false;
            }

            // completedAt >= startedAt
            if (new Date(entry.completedAt).getTime() < new Date(entry.startedAt).getTime()) {
              return false;
            }

            // seq must be a positive integer
            if (typeof entry.seq !== 'number' || entry.seq < 1 || !Number.isInteger(entry.seq)) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.5: the trace is complete — no operations are missing from the trace',
    () => {
      fc.assert(
        fc.asyncProperty(operationSequenceArb, async (operations) => {
          const skill = buildPermissiveSkill(operations);
          const mergedSkill = computeReachableScope([skill]);
          const trace = new ActionTrace();
          const mockToolbox = createMockToolbox(operations);
          const guardedToolbox = createScopeGuardedToolbox(mockToolbox, mergedSkill, trace);

          await executeOperations(guardedToolbox, operations);

          const entries = trace.getEntries();
          const toolboxEntries = entries.filter(e => e.kind === 'toolbox');

          // The number of trace entries must equal the number of operations executed
          if (toolboxEntries.length !== operations.length) return false;

          // Each trace entry's operationName must match the corresponding operation's kind
          for (let i = 0; i < operations.length; i++) {
            const expectedOpName = operations[i].kind;
            const actualOpName = toolboxEntries[i].operationName;
            if (actualOpName !== expectedOpName) return false;
          }

          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.5, R7.1: failed operations are recorded with outcome "failed" and succeeded with "succeeded"',
    () => {
      fc.assert(
        fc.asyncProperty(operationSequenceArb, async (operations) => {
          const skill = buildPermissiveSkill(operations);
          const mergedSkill = computeReachableScope([skill]);
          const trace = new ActionTrace();
          const mockToolbox = createMockToolbox(operations);
          const guardedToolbox = createScopeGuardedToolbox(mockToolbox, mergedSkill, trace);

          await executeOperations(guardedToolbox, operations);

          const entries = trace.getEntries();
          const toolboxEntries = entries.filter(e => e.kind === 'toolbox');

          for (let i = 0; i < operations.length; i++) {
            const expectedOutcome = operations[i].shouldSucceed ? 'succeeded' : 'failed';
            if (toolboxEntries[i].outcome !== expectedOutcome) return false;
          }

          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R7.1: the ActionTrace class assigns monotonically increasing sequence numbers starting from 1',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (count) => {
            const trace = new ActionTrace();
            const now = new Date().toISOString();

            for (let i = 0; i < count; i++) {
              trace.record({
                kind: 'toolbox',
                operationName: `op_${i}`,
                startedAt: now,
                completedAt: now,
                outcome: 'succeeded',
              });
            }

            const entries = trace.getEntries();
            if (entries.length !== count) return false;

            // Verify monotonically increasing from 1
            for (let i = 0; i < entries.length; i++) {
              if (entries[i].seq !== i + 1) return false;
            }

            return true;
          }
        ),
        { numRuns: 100 },
      );
    },
  );
});
