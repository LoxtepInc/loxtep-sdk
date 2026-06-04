/**
 * CLI: loxtep test <module> --event <file> — local execution with approval prompts.
 *
 * Steps:
 * 1. Call requireAttachedProject() to verify preconditions (R1.7, R1.10)
 * 2. Load the named module from `workflows/<name>.ts` (dynamic import)
 * 3. Read the event file (JSON)
 * 4. Set up a HandlerContext with toolbox + agent from the SDK authoring
 * 5. Execute the handler with the event and context
 * 6. For guarded operations (requireApproval), prompt in the terminal (≤300s)
 * 7. On approval: execute; on reject/timeout: skip, leave unchanged, record
 * 8. Print the resulting action trace
 *
 * Requirements: 1.5, 6.2, 6.3
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import {
  requireAttachedProject,
  preconditionToCliResult,
  type CliResult,
} from '../project-context.js';
import { requireCliClient } from '../create-cli-client.js';
import { createToolbox, type Toolbox } from '../../authoring/toolbox.js';
import { ActionTrace, type ActionTraceEntry } from '../../authoring/agent.js';
import type { HandlerContext, DataWorkflowModule } from '../../authoring/types.js';

// ─── Approval prompt helpers ─────────────────────────────────────────────────

/** Timeout for approval prompts in milliseconds (300 seconds per R6.2, R6.3). */
const APPROVAL_TIMEOUT_MS = 300_000;

/**
 * Prompt the user in the terminal for approval of a guarded operation.
 * Resolves to `true` if approved, `false` if rejected or timed out.
 *
 * @param operationName - The guarded operation name to display.
 * @param targetResource - The target resource to display.
 * @param rl - readline interface (injectable for testing).
 * @returns Whether the operation was approved.
 */
export async function promptApproval(
  operationName: string,
  targetResource: string,
  rl?: ReadlineInterface
): Promise<{ approved: boolean; timedOut: boolean }> {
  const ownRl = !rl;
  const readline = rl ?? createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise<{ approved: boolean; timedOut: boolean }>((resolvePromise) => {
    let settled = false;
    const settle = (approved: boolean, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ownRl) readline.close();
      resolvePromise({ approved, timedOut });
    };

    // Timeout after 300 seconds (R6.3)
    const timer = setTimeout(() => {
      settle(false, true);
    }, APPROVAL_TIMEOUT_MS);

    // Use stderr for prompts so stdout remains clean for trace output
    const prompt =
      `\n⚠️  Guarded operation requires approval:\n` +
      `   Operation: ${operationName}\n` +
      `   Target:    ${targetResource}\n` +
      `   Approve? (y/n, 300s timeout): `;

    readline.question(prompt, (answer: string) => {
      const normalized = answer.trim().toLowerCase();
      const approved = normalized === 'y' || normalized === 'yes';
      settle(approved, false);
    });
  });
}

// ─── Guarded toolbox wrapper ─────────────────────────────────────────────────

/**
 * Wraps a toolbox so that operations listed in `requireApproval` prompt the user
 * before executing. On rejection or timeout, the operation is skipped, the target
 * resource is left unchanged, and the outcome is recorded in the action trace.
 *
 * @param toolbox - The underlying toolbox.
 * @param guardedOps - Set of operation names that require approval.
 * @param trace - Action trace to record outcomes.
 * @param promptFn - Injectable approval prompt (defaults to terminal prompt).
 * @returns A wrapped toolbox with approval guards.
 */
export function createApprovalGuardedToolbox(
  toolbox: Toolbox,
  guardedOps: Set<string>,
  trace: ActionTrace,
  promptFn: (opName: string, target: string) => Promise<{ approved: boolean; timedOut: boolean }> = promptApproval
): Toolbox {
  /**
   * Wrap a toolbox method with the approval guard:
   * - If the operation name is in guardedOps, prompt for approval.
   * - On approval: execute and record success/failure.
   * - On rejection/timeout: skip, leave unchanged, record the skip (R6.3).
   */
  function guardMethod<A extends unknown[], R>(
    opName: string,
    targetFn: (args: A) => string,
    fn: (...args: A) => Promise<R>
  ): (...args: A) => Promise<R> {
    return async (...args: A): Promise<R> => {
      const target = targetFn(args);

      if (guardedOps.has(opName)) {
        const { approved, timedOut } = await promptFn(opName, target);

        if (!approved) {
          // R6.3: Skip the operation, leave target unchanged, record the outcome
          const outcome = timedOut ? 'timeout_skipped' : 'rejected_skipped';
          trace.record({
            kind: 'toolbox',
            operationName: opName,
            targetResource: target,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            outcome: 'failed',
            error: timedOut
              ? 'Guarded operation skipped: approval timed out (300s)'
              : 'Guarded operation skipped: rejected by user',
          });
          throw new GuardedOperationSkipped(opName, target, timedOut);
        }
      }

      // Execute the actual operation and trace it
      const startedAt = new Date().toISOString();
      try {
        const result = await fn(...args);
        trace.record({
          kind: 'toolbox',
          operationName: opName,
          targetResource: target,
          startedAt,
          completedAt: new Date().toISOString(),
          outcome: 'succeeded',
        });
        return result;
      } catch (err) {
        if (err instanceof GuardedOperationSkipped) throw err;
        trace.record({
          kind: 'toolbox',
          operationName: opName,
          targetResource: target,
          startedAt,
          completedAt: new Date().toISOString(),
          outcome: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    };
  }

  return {
    dataProducts: {
      write: guardMethod(
        'dataProducts.write',
        (args) => (args as [{ name: string }, unknown])[0]?.name ?? 'unknown',
        (ref, event) => toolbox.dataProducts.write(ref as any, event)
      ),
      query: guardMethod(
        'dataProducts.query',
        (args) => (args as [{ name: string }, string])[0]?.name ?? 'unknown',
        (ref, sql) => toolbox.dataProducts.query(ref as any, sql as any)
      ),
      get: guardMethod(
        'dataProducts.get',
        (args) => (args as [{ name: string }])[0]?.name ?? 'unknown',
        (ref) => toolbox.dataProducts.get(ref as any)
      ),
      list: guardMethod(
        'dataProducts.list',
        () => '*',
        (filters?) => toolbox.dataProducts.list(filters as any)
      ),
    },
    queues: {
      write: guardMethod(
        'queues.write',
        (args) => (args as [{ name: string }, unknown])[0]?.name ?? 'unknown',
        (ref, event) => toolbox.queues.write(ref as any, event)
      ),
      getMetadata: guardMethod(
        'queues.getMetadata',
        (args) => (args as [{ name: string }])[0]?.name ?? 'unknown',
        (ref) => toolbox.queues.getMetadata(ref as any)
      ),
    },
    connections: {
      list: guardMethod(
        'connections.list',
        () => '*',
        () => toolbox.connections.list()
      ),
      get: guardMethod(
        'connections.get',
        (args) => (args as [string])[0] ?? 'unknown',
        (id) => toolbox.connections.get(id as any)
      ),
      test: guardMethod(
        'connections.test',
        (args) => (args as [string])[0] ?? 'unknown',
        (id) => toolbox.connections.test(id as any)
      ),
    },
    workflows: {
      list: guardMethod(
        'workflows.list',
        () => '*',
        () => toolbox.workflows.list()
      ),
      getGraph: guardMethod(
        'workflows.getGraph',
        (args) => (args as [{ name: string }])[0]?.name ?? 'unknown',
        (ref) => toolbox.workflows.getGraph(ref as any)
      ),
    },
  };
}

// ─── Error for skipped guarded operations ────────────────────────────────────

/**
 * Thrown when a guarded operation is skipped due to rejection or timeout.
 * This is a flow-control mechanism — it's caught by the test runner and the
 * handler continues executing remaining operations (non-fatal for the handler).
 */
export class GuardedOperationSkipped extends Error {
  readonly operationName: string;
  readonly targetResource: string;
  readonly timedOut: boolean;

  constructor(operationName: string, targetResource: string, timedOut: boolean) {
    super(
      timedOut
        ? `Guarded operation "${operationName}" on "${targetResource}" skipped: approval timed out (300s)`
        : `Guarded operation "${operationName}" on "${targetResource}" skipped: rejected by user`
    );
    this.name = 'GuardedOperationSkipped';
    this.operationName = operationName;
    this.targetResource = targetResource;
    this.timedOut = timedOut;
    Object.setPrototypeOf(this, GuardedOperationSkipped.prototype);
  }
}

// ─── Module loader ───────────────────────────────────────────────────────────

/**
 * Attempt to dynamically import a Data_Workflow_Module by name from the
 * `workflows/` directory relative to the project root.
 *
 * Tries `.ts` first, then `.js`, then no extension.
 */
async function loadWorkflowModule(
  projectDir: string,
  moduleName: string
): Promise<DataWorkflowModule | null> {
  const workflowsDir = join(projectDir, 'workflows');
  const candidates = [
    join(workflowsDir, `${moduleName}.ts`),
    join(workflowsDir, `${moduleName}.js`),
    join(workflowsDir, moduleName),
  ];

  for (const candidate of candidates) {
    try {
      // Use dynamic import; for .ts files this requires a loader (tsx, ts-node, etc.)
      const mod = await import(candidate);
      // The module should export a default or named `workflow` that is a DataWorkflowModule
      const workflow: DataWorkflowModule | undefined =
        mod.default ?? mod.workflow ?? mod;

      if (workflow && typeof workflow.handler === 'function' && workflow.name) {
        return workflow;
      }
    } catch {
      // Try next candidate
      continue;
    }
  }

  return null;
}

// ─── Trace printer ───────────────────────────────────────────────────────────

/**
 * Format action trace entries for human-readable terminal output.
 */
function formatTrace(entries: ActionTraceEntry[]): string[] {
  if (entries.length === 0) return ['(no operations recorded in action trace)'];

  const lines: string[] = ['', '─── Action Trace ───────────────────────────────────'];
  for (const entry of entries) {
    const icon =
      entry.outcome === 'succeeded' ? '✓' :
      entry.outcome === 'blocked' ? '⊘' : '✗';
    const targetStr = entry.targetResource ? ` → ${entry.targetResource}` : '';
    const errorStr = entry.error ? `  (${entry.error})` : '';
    lines.push(`  ${icon} [${entry.seq}] ${entry.operationName}${targetStr} [${entry.outcome}]${errorStr}`);
  }
  lines.push('────────────────────────────────────────────────────');
  return lines;
}

// ─── Main test command ───────────────────────────────────────────────────────

export interface TestCommandOptions {
  /** Working directory (defaults to process.cwd()). */
  cwd?: string;
  /** Module name to test. */
  moduleName: string;
  /** Path to the event file (JSON). */
  eventFile: string;
  /** Injectable approval prompt function (for testing). */
  promptFn?: (opName: string, target: string) => Promise<{ approved: boolean; timedOut: boolean }>;
}

/**
 * Execute the `loxtep test <module> --event <file>` command.
 *
 * Loads one Data_Workflow_Module by name, executes its handler locally against
 * the attached instance with the sample event, prints the action trace.
 * Guarded operations prompt in the terminal (≤300s) and execute only on approval.
 * On rejection/timeout: skip, leave unchanged, record in trace (R6.2, R6.3).
 *
 * @param options - Command options.
 * @returns Structured CLI result for testability.
 */
export async function runTestCommand(options: TestCommandOptions): Promise<CliResult> {
  const workingDir = options.cwd ?? process.cwd();

  // 1. Verify preconditions: project exists and is attached (R1.7, R1.10)
  const precondition = requireAttachedProject(workingDir);
  if (!precondition.ok) {
    return preconditionToCliResult(precondition.failure);
  }

  const { projectDir, project } = precondition;
  const { project_id: projectId, instance_id: instanceId } = project;

  // 2. Load the named module from workflows/<name>.ts
  const workflowModule = await loadWorkflowModule(projectDir, options.moduleName);
  if (!workflowModule) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Module "${options.moduleName}" not found in workflows/ directory.`,
        `Looked for: workflows/${options.moduleName}.ts, workflows/${options.moduleName}.js`,
      ],
    };
  }

  // 3. Read the event file (JSON)
  let event: unknown;
  try {
    const eventPath = resolve(workingDir, options.eventFile);
    const eventRaw = readFileSync(eventPath, 'utf-8');
    event = JSON.parse(eventRaw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Failed to read event file "${options.eventFile}": ${message}`],
    };
  }

  // 4. Set up HandlerContext + toolbox
  const clientResult = await requireCliClient();
  const { client } = clientResult;

  const handlerContext: HandlerContext = {
    workflowName: workflowModule.name,
    instanceId,
    projectId,
  };

  const toolbox = createToolbox({ client, projectId });
  const trace = new ActionTrace();

  // 5. Build guarded operations set from requireApproval (R6.1, R6.2)
  const guardedOps = new Set<string>(workflowModule.requireApproval ?? []);

  // 6. Create approval-guarded toolbox
  const promptFn = options.promptFn ?? promptApproval;
  const guardedToolbox = createApprovalGuardedToolbox(toolbox, guardedOps, trace, promptFn);

  // 7. Execute the handler with the event and guarded context
  // The handler receives the context object; toolbox operations go through the guard.
  // We attach the guarded toolbox to the context so the handler can use it.
  const execContext = {
    ...handlerContext,
    toolbox: guardedToolbox,
  };

  trace.record({
    kind: 'toolbox',
    operationName: 'handler.start',
    targetResource: workflowModule.name,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    outcome: 'succeeded',
  });

  try {
    await workflowModule.handler(execContext, event);
    trace.record({
      kind: 'toolbox',
      operationName: 'handler.complete',
      targetResource: workflowModule.name,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: 'succeeded',
    });
  } catch (err: unknown) {
    // GuardedOperationSkipped is non-fatal — handler may continue
    if (!(err instanceof GuardedOperationSkipped)) {
      const message = err instanceof Error ? err.message : String(err);
      trace.record({
        kind: 'toolbox',
        operationName: 'handler.error',
        targetResource: workflowModule.name,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        outcome: 'failed',
        error: message,
      });
    }
  }

  // 8. Print the resulting action trace (R1.5)
  const traceLines = formatTrace(trace.getEntries());
  const summaryLines = [
    `Test completed for module "${workflowModule.name}"`,
    ...traceLines,
  ];

  return {
    exitCode: 0,
    stdout: summaryLines,
    stderr: [],
  };
}

/**
 * CLI entry point for `loxtep test`.
 * Parses args, prints output, and sets process.exitCode from the structured result.
 */
export async function runTest(): Promise<void> {
  const args = process.argv.slice(2);
  // Expected: loxtep test <module> --event <file>
  const moduleName = args[1]; // args[0] is 'test'
  const eventIdx = args.indexOf('--event');
  const eventFile = eventIdx >= 0 ? args[eventIdx + 1] : undefined;

  if (!moduleName || moduleName.startsWith('--')) {
    console.error('Usage: loxtep test <module> --event <file>');
    process.exitCode = 1;
    return;
  }
  if (!eventFile) {
    console.error('Usage: loxtep test <module> --event <file>');
    console.error('Missing required --event <file> argument.');
    process.exitCode = 1;
    return;
  }

  const result = await runTestCommand({ moduleName, eventFile });
  for (const line of result.stdout) {
    console.log(line);
  }
  for (const line of result.stderr) {
    console.error(line);
  }
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
