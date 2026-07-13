import fc from 'fast-check';
import { createToolbox, ToolboxOperationError } from './toolbox';
import type { Toolbox, DataProductRef, WorkflowRef } from './toolbox';
import type { QueueRef } from './types';

/**
 * Feature: ai-first-platform-surface
 * Property 19: toolbox failure surfaces the operation without model fallback
 *
 * For any toolbox method that fails (throws), the error:
 * 1. Is a ToolboxOperationError identifying the failed operation (namespace + operation)
 * 2. No model/LLM is ever invoked — a model invocation counter stays at 0
 *
 * **Validates: Requirements 4.7**
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * All toolbox namespaces and their operations, used to generate arbitrary
 * (namespace, operation) pairs for property-based testing.
 */
interface ToolboxCall {
  namespace: string;
  operation: string;
  invoke: (toolbox: Toolbox) => Promise<unknown>;
}

/**
 * Enumerate all toolbox method calls with arbitrary references.
 * Each entry specifies the namespace, operation name, and a function to invoke it.
 */
function allToolboxCalls(dpRef: DataProductRef, qRef: QueueRef, wfRef: WorkflowRef, connId: string): ToolboxCall[] {
  return [
    { namespace: 'dataProducts', operation: 'write', invoke: (tb) => tb.dataProducts.write(dpRef, { data: 'x' }) },
    { namespace: 'dataProducts', operation: 'query', invoke: (tb) => tb.dataProducts.query(dpRef, 'SELECT 1') },
    { namespace: 'dataProducts', operation: 'get', invoke: (tb) => tb.dataProducts.get(dpRef) },
    { namespace: 'dataProducts', operation: 'list', invoke: (tb) => tb.dataProducts.list() },
    { namespace: 'queues', operation: 'write', invoke: (tb) => tb.queues.write(qRef, { data: 'x' }) },
    { namespace: 'queues', operation: 'getMetadata', invoke: (tb) => tb.queues.getMetadata(qRef) },
    { namespace: 'connections', operation: 'list', invoke: (tb) => tb.connections.list() },
    { namespace: 'connections', operation: 'get', invoke: (tb) => tb.connections.get(connId) },
    { namespace: 'connections', operation: 'test', invoke: (tb) => tb.connections.test(connId) },
    { namespace: 'workflows', operation: 'list', invoke: (tb) => tb.workflows.list() },
    { namespace: 'workflows', operation: 'getGraph', invoke: (tb) => tb.workflows.getGraph(wfRef) },
  ];
}

/**
 * Create a mock client where every method rejects with the given error.
 * Also tracks a model invocation counter that should always remain 0.
 */
function createFailingMockClient(errorMessage: string) {
  let modelInvocationCount = 0;

  // A hypothetical model invocation function — if the toolbox ever called a model,
  // this counter would increment. We inject it as a proxy trap on the mock client.
  const invokeModel = () => {
    modelInvocationCount++;
    return Promise.resolve({ response: 'model response' });
  };

  const mockWriter = {
    write: jest.fn().mockRejectedValue(new Error(errorMessage)),
    close: jest.fn().mockRejectedValue(new Error(errorMessage)),
  };

  const client = {
    data_products: {
      get_writer: jest.fn().mockRejectedValue(new Error(errorMessage)),
      query: jest.fn().mockRejectedValue(new Error(errorMessage)),
      get: jest.fn().mockRejectedValue(new Error(errorMessage)),
      list: jest.fn().mockRejectedValue(new Error(errorMessage)),
    },
    queues: {
      open_writer: jest.fn().mockRejectedValue(new Error(errorMessage)),
      get_queue_metadata: jest.fn().mockRejectedValue(new Error(errorMessage)),
    },
    triggers: {
      list: jest.fn().mockRejectedValue(new Error(errorMessage)),
      get: jest.fn().mockRejectedValue(new Error(errorMessage)),
      test: jest.fn().mockRejectedValue(new Error(errorMessage)),
    },
    workflows: {
      list: jest.fn().mockRejectedValue(new Error(errorMessage)),
      get_graph: jest.fn().mockRejectedValue(new Error(errorMessage)),
    },
    // Model/LLM namespace — should NEVER be called by the toolbox
    model: {
      invoke: invokeModel,
      complete: invokeModel,
      chat: invokeModel,
    },
  } as unknown as Parameters<typeof createToolbox>[0]['client'];

  return { client, getModelInvocationCount: () => modelInvocationCount };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary non-empty error message. */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

/** Arbitrary data product reference. */
const dataProductRefArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }).map(s => `dp_${s.replace(/[^a-z0-9]/gi, 'x')}`),
  name: fc.string({ minLength: 1, maxLength: 64 }).map(s => s.replace(/[^a-z0-9_]/gi, 'a') || 'dp'),
});

/** Arbitrary queue reference. */
const queueRefArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }).map(s => `q_${s.replace(/[^a-z0-9]/gi, 'x')}`),
  name: fc.string({ minLength: 1, maxLength: 64 }).map(s => s.replace(/[^a-z0-9_]/gi, 'a') || 'queue'),
});

/** Arbitrary workflow reference. */
const workflowRefArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }).map(s => `wf_${s.replace(/[^a-z0-9]/gi, 'x')}`),
  name: fc.string({ minLength: 1, maxLength: 64 }).map(s => s.replace(/[^a-z0-9_]/gi, 'a') || 'workflow'),
});

/** Arbitrary connection ID. */
const connectionIdArb = fc.string({ minLength: 1, maxLength: 50 }).map(s => `conn_${s.replace(/[^a-z0-9]/gi, 'x')}`);

/** Arbitrary index into the list of all toolbox calls (0–10). */
const callIndexArb = fc.integer({ min: 0, max: 10 });

/** Arbitrary project ID. */
const projectIdArb = fc.string({ minLength: 1, maxLength: 50 }).map(s => `proj_${s.replace(/[^a-z0-9]/gi, 'x')}`);

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 19: toolbox failure surfaces the operation without model fallback', () => {
  it(
    'R4.7: any failing toolbox method throws a ToolboxOperationError identifying the operation and never invokes a model',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          errorMessageArb,
          dataProductRefArb,
          queueRefArb,
          workflowRefArb,
          connectionIdArb,
          callIndexArb,
          projectIdArb,
          async (errorMsg, dpRef, qRef, wfRef, connId, callIdx, projectId) => {
            // Create a mock client where all operations fail
            const { client, getModelInvocationCount } = createFailingMockClient(errorMsg);

            // Create the toolbox under test
            const toolbox = createToolbox({ client, projectId });

            // Pick one of the 11 toolbox methods to call
            const calls = allToolboxCalls(dpRef, qRef, wfRef, connId);
            const call = calls[callIdx];

            // Invoke the method — it must throw
            let thrownError: unknown;
            try {
              await call.invoke(toolbox);
              // If we get here, the method did NOT throw — property violated
              return false;
            } catch (err) {
              thrownError = err;
            }

            // 1. The thrown error must be a ToolboxOperationError
            if (!(thrownError instanceof ToolboxOperationError)) {
              return false;
            }

            // 2. It must identify the correct namespace and operation
            if (thrownError.namespace !== call.namespace) {
              return false;
            }
            if (thrownError.operation !== call.operation) {
              return false;
            }

            // 3. It must have the TOOLBOX_OPERATION_FAILED code
            if (thrownError.code !== 'TOOLBOX_OPERATION_FAILED') {
              return false;
            }

            // 4. No model was ever invoked (counter stays at 0)
            if (getModelInvocationCount() !== 0) {
              return false;
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
