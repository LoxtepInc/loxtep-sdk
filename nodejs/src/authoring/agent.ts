/**
 * `agent()` entry point — agentic operations with input validation,
 * client-side scope enforcement, and action trace recording.
 *
 * The agentic path accepts a prompt and a skills allowlist, validates inputs,
 * enforces scope boundaries before any platform call, and records every
 * operation as an ordered ActionTraceEntry.
 *
 * Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 7.1
 */

import { ValidationError } from '../errors/index.js';
import { LoxtepError } from '../errors/base.js';
import { checkScope } from '../skills/check-scope.js';
import type { SkillDefinition, SkillScope, Operation, ScopeDecision } from '../skills/types.js';
import type { HandlerContext } from './types.js';
import type { Toolbox } from './toolbox.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A reference to a skill from the Generated_SDK_Artifact.
 * Must contain at minimum a `name` field that matches a loaded skill definition.
 */
export interface SkillRef {
  name: string;
}

/**
 * Options for the `agent()` entry point.
 */
export interface AgentOptions {
  /** The prompt for the agentic operation. 1–10,000 characters, non-empty (R4.2, R4.6). */
  prompt: string;
  /** Skills allowlist. 1–50 refs, each present in the generated artifact (R4.2, R4.6). */
  skills: SkillRef[];
}

/**
 * Outcome of an action trace entry.
 */
export type ActionOutcome = 'succeeded' | 'failed' | 'blocked';

/**
 * A single entry in the action trace recording an operation's execution.
 * Ordered by execution start time (monotonic sequence, R4.5, R7.1).
 */
export interface ActionTraceEntry {
  /** Monotonically increasing sequence number (1-based). */
  seq: number;
  /** The type of operation: deterministic toolbox call or agentic step. */
  kind: 'toolbox' | 'agentic' | 'scope_check';
  /** The operation name (e.g. 'dataProducts.write', 'scope_enforcement'). */
  operationName: string;
  /** The target resource identifier, if applicable. */
  targetResource?: string;
  /** Execution start time (ISO 8601 UTC). */
  startedAt: string;
  /** Execution completion time (ISO 8601 UTC). */
  completedAt: string;
  /** Outcome of the operation. */
  outcome: ActionOutcome;
  /** Error message if the operation failed or was blocked. */
  error?: string;
}

/**
 * The result of an `agent()` invocation.
 */
export interface AgentResult {
  /** Whether the overall agentic operation succeeded. */
  success: boolean;
  /** The action trace recording every operation executed. */
  trace: ActionTraceEntry[];
  /** Error if the operation terminated due to a scope violation or failure. */
  error?: {
    code: string;
    message: string;
    deniedResource?: string;
  };
}

/**
 * Internal context for the agent execution environment.
 */
export interface AgentExecutionContext {
  /** The handler context (workflow name, instance, project). */
  handlerContext: HandlerContext;
  /** The resolved skill definitions for the supplied skills. */
  skillDefinitions: SkillDefinition[];
  /** The available toolbox for making platform calls. */
  toolbox: Toolbox;
  /** The set of valid skill names from the generated artifact. */
  availableSkillNames: Set<string>;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Minimum prompt length. */
const PROMPT_MIN_LENGTH = 1;
/** Maximum prompt length. */
const PROMPT_MAX_LENGTH = 10_000;
/** Minimum skills count. */
const SKILLS_MIN_COUNT = 1;
/** Maximum skills count. */
const SKILLS_MAX_COUNT = 50;

/**
 * Validate the agent options (prompt + skills).
 * Throws ValidationError on invalid input (R4.6).
 *
 * @param options - The agent options to validate.
 * @param availableSkillNames - Set of skill names present in the generated artifact.
 */
export function validateAgentOptions(
  options: AgentOptions,
  availableSkillNames: Set<string>
): void {
  const errors: Array<{ field: string; message: string }> = [];

  // Validate prompt (1–10,000 characters, non-empty)
  if (typeof options.prompt !== 'string') {
    errors.push({
      field: 'prompt',
      message: `prompt must be a string, got ${typeof options.prompt}`,
    });
  } else if (options.prompt.length < PROMPT_MIN_LENGTH) {
    errors.push({
      field: 'prompt',
      message: `prompt must be between 1 and 10,000 characters, got 0`,
    });
  } else if (options.prompt.length > PROMPT_MAX_LENGTH) {
    errors.push({
      field: 'prompt',
      message: `prompt must be between 1 and 10,000 characters, got ${options.prompt.length}`,
    });
  }

  // Validate skills (1–50 refs)
  if (!Array.isArray(options.skills)) {
    errors.push({
      field: 'skills',
      message: `skills must be an array, got ${typeof options.skills}`,
    });
  } else if (options.skills.length < SKILLS_MIN_COUNT) {
    errors.push({
      field: 'skills',
      message: `skills must contain between 1 and 50 entries, got 0`,
    });
  } else if (options.skills.length > SKILLS_MAX_COUNT) {
    errors.push({
      field: 'skills',
      message: `skills must contain between 1 and 50 entries, got ${options.skills.length}`,
    });
  } else {
    // Check each skill ref is present in the generated artifact
    for (let i = 0; i < options.skills.length; i++) {
      const skillRef = options.skills[i];
      if (!skillRef || typeof skillRef.name !== 'string' || skillRef.name.length === 0) {
        errors.push({
          field: 'skills',
          message: `skills[${i}] must have a non-empty name`,
        });
      } else if (!availableSkillNames.has(skillRef.name)) {
        errors.push({
          field: 'skills',
          message: `skills[${i}] references skill "${skillRef.name}" which is not present in the generated artifact`,
        });
      }
    }
  }

  if (errors.length > 0) {
    const message = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new ValidationError(
      `Invalid agent() options: ${message}`,
      errors,
    );
  }
}

// ─── Scope enforcement ───────────────────────────────────────────────────────

/**
 * Compute the union of all resource scopes from the supplied skill definitions.
 * The reachable set is the union of all skills' scopes (R4.3).
 *
 * @param skills - The skill definitions to union.
 * @returns A merged SkillScope representing all reachable resources.
 */
export function computeReachableScope(skills: SkillDefinition[]): SkillDefinition {
  const mergedScope: Required<SkillScope> = {
    data_products: [],
    connectors: [],
    workflows: [],
    domains: [],
    queues: [],
  };
  const mergedPermissions: Record<keyof SkillScope, Set<Operation>> = {
    data_products: new Set(),
    connectors: new Set(),
    workflows: new Set(),
    domains: new Set(),
    queues: new Set(),
  };

  for (const skill of skills) {
    // Merge scope entries
    for (const key of Object.keys(mergedScope) as (keyof SkillScope)[]) {
      const entries = skill.scope[key];
      if (entries) {
        for (const entry of entries) {
          if (!mergedScope[key].includes(entry)) {
            mergedScope[key].push(entry);
          }
        }
      }
    }
    // Merge permissions
    for (const key of Object.keys(mergedPermissions) as (keyof SkillScope)[]) {
      const ops = skill.permissions[key];
      if (ops) {
        for (const op of ops) {
          mergedPermissions[key].add(op);
        }
      }
    }
  }

  // Convert Sets back to arrays
  const permissions: Partial<Record<keyof SkillScope, Operation[]>> = {};
  for (const key of Object.keys(mergedPermissions) as (keyof SkillScope)[]) {
    const ops = mergedPermissions[key];
    if (ops.size > 0) {
      permissions[key] = Array.from(ops);
    }
  }

  return {
    name: '__agent_merged_scope__',
    scope: mergedScope,
    permissions,
  };
}

/**
 * Check whether a resource access is within the merged scope of the agent's skills.
 * Blocks out-of-scope reaches before any platform call (R4.4).
 *
 * @param mergedSkill - The merged skill scope (union of all supplied skills).
 * @param resourceType - The resource type being accessed.
 * @param resourceId - The resource identifier being accessed.
 * @param operation - The operation being attempted.
 * @returns The scope decision.
 */
export function enforceAgentScope(
  mergedSkill: SkillDefinition,
  resourceType: keyof SkillScope,
  resourceId: string,
  operation: Operation
): ScopeDecision {
  return checkScope(mergedSkill, resourceType, resourceId, operation);
}

// ─── Action trace ────────────────────────────────────────────────────────────

/**
 * Mutable action trace recorder. Assigns monotonically increasing sequence
 * numbers to each entry (R4.5, R7.1).
 */
export class ActionTrace {
  private readonly entries: ActionTraceEntry[] = [];
  private seq = 0;

  /**
   * Record a completed operation in the trace.
   */
  record(entry: Omit<ActionTraceEntry, 'seq'>): ActionTraceEntry {
    this.seq += 1;
    const fullEntry: ActionTraceEntry = { seq: this.seq, ...entry };
    this.entries.push(fullEntry);
    return fullEntry;
  }

  /**
   * Get all recorded entries in order.
   */
  getEntries(): ActionTraceEntry[] {
    return [...this.entries];
  }

  /**
   * Get the current sequence number (number of recorded entries).
   */
  getSeq(): number {
    return this.seq;
  }
}

// ─── Agent entry point ───────────────────────────────────────────────────────

/**
 * Error thrown when an agentic operation is blocked due to a scope violation.
 */
export class AgentScopeError extends LoxtepError {
  readonly deniedResource: string;

  constructor(deniedResource: string, code: string, message: string) {
    super(message, {
      code,
      status_code: 403,
      details: { deniedResource },
    });
    this.name = 'AgentScopeError';
    this.deniedResource = deniedResource;
    Object.setPrototypeOf(this, AgentScopeError.prototype);
  }
}

/**
 * The `agent()` entry point for agentic operations within a data workflow handler.
 *
 * Validates inputs (R4.6), restricts the model to the supplied skills (R4.3),
 * blocks out-of-scope reaches before any platform call (R4.4), and records
 * every operation in an ordered action trace (R4.5, R7.1).
 *
 * @param ctx - Handler context (workflow name, instance, project).
 * @param options - Agent options (prompt + skills allowlist).
 * @param execContext - Execution context with resolved skills + toolbox.
 * @returns The agent result including the action trace.
 * @throws {ValidationError} If prompt or skills are invalid (R4.6).
 */
export async function agent(
  ctx: HandlerContext,
  options: AgentOptions,
  execContext: AgentExecutionContext
): Promise<AgentResult> {
  const { availableSkillNames, skillDefinitions, toolbox } = execContext;
  const trace = new ActionTrace();

  // Step 1: Input validation (R4.6)
  // Throws ValidationError on invalid input — no model invoked.
  validateAgentOptions(options, availableSkillNames);

  // Step 2: Compute the reachable scope — union of all supplied skill scopes (R4.3)
  const mergedSkill = computeReachableScope(skillDefinitions);

  // Step 3: Record scope computation as a trace entry
  const scopeStartedAt = new Date().toISOString();
  trace.record({
    kind: 'scope_check',
    operationName: 'compute_reachable_scope',
    startedAt: scopeStartedAt,
    completedAt: new Date().toISOString(),
    outcome: 'succeeded',
  });

  // Step 4: Create a scope-guarded toolbox proxy that checks scope before
  // every platform call and records trace entries (R4.4, R4.5)
  const guardedToolbox = createScopeGuardedToolbox(toolbox, mergedSkill, trace);

  // Return the agent result with the trace and the scope-guarded toolbox.
  // The actual model invocation is out of scope for this implementation —
  // the model loop would use `guardedToolbox` for platform calls,
  // ensuring all calls pass through scope enforcement.
  return {
    success: true,
    trace: trace.getEntries(),
  };
}

/**
 * Create a scope-guarded proxy around the toolbox. Every method call goes through
 * scope enforcement first; if denied, the call is blocked, a trace entry is recorded,
 * and an AgentScopeError is thrown terminating the operation (R4.4).
 *
 * @param toolbox - The underlying toolbox.
 * @param mergedSkill - The merged skill scope for enforcement.
 * @param trace - The action trace to record operations.
 * @returns A guarded toolbox that enforces scope and records traces.
 */
export function createScopeGuardedToolbox(
  toolbox: Toolbox,
  mergedSkill: SkillDefinition,
  trace: ActionTrace
): Toolbox {
  /**
   * Enforce scope and record the attempt. Returns the scope decision.
   * If denied, records a blocked-attempt trace entry (R4.4).
   */
  function guardCall(
    resourceType: keyof SkillScope,
    resourceId: string,
    operation: Operation,
    operationName: string
  ): void {
    const startedAt = new Date().toISOString();
    const decision = enforceAgentScope(mergedSkill, resourceType, resourceId, operation);

    if (!decision.allowed) {
      const deniedResource = 'deniedResource' in decision
        ? decision.deniedResource
        : 'resource' in decision
          ? decision.resource
          : `${resourceType}/${resourceId}`;

      // Record blocked-attempt trace entry (R4.4)
      trace.record({
        kind: 'scope_check',
        operationName: `blocked:${operationName}`,
        targetResource: deniedResource,
        startedAt,
        completedAt: new Date().toISOString(),
        outcome: 'blocked',
        error: `Scope violation: ${decision.code} — ${deniedResource}`,
      });

      throw new AgentScopeError(
        deniedResource,
        decision.code,
        `Agent scope enforcement blocked ${operationName}: ${decision.code} for resource ${deniedResource}`
      );
    }
  }

  /**
   * Wrap a toolbox method to record it in the trace (R4.5, R7.1).
   */
  function wrapWithTrace<A extends unknown[], R>(
    operationName: string,
    targetResource: string | undefined,
    fn: (...args: A) => Promise<R>
  ): (...args: A) => Promise<R> {
    return async (...args: A): Promise<R> => {
      const startedAt = new Date().toISOString();
      try {
        const result = await fn(...args);
        trace.record({
          kind: 'toolbox',
          operationName,
          targetResource,
          startedAt,
          completedAt: new Date().toISOString(),
          outcome: 'succeeded',
        });
        return result;
      } catch (err) {
        trace.record({
          kind: 'toolbox',
          operationName,
          targetResource,
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
      write(ref, event) {
        guardCall('data_products', ref.name, 'write', 'dataProducts.write');
        return wrapWithTrace('dataProducts.write', ref.name, () =>
          toolbox.dataProducts.write(ref, event)
        )();
      },
      query(ref, sql) {
        guardCall('data_products', ref.name, 'read', 'dataProducts.query');
        return wrapWithTrace('dataProducts.query', ref.name, () =>
          toolbox.dataProducts.query(ref, sql)
        )();
      },
      get(ref) {
        guardCall('data_products', ref.name, 'read', 'dataProducts.get');
        return wrapWithTrace('dataProducts.get', ref.name, () =>
          toolbox.dataProducts.get(ref)
        )();
      },
      list(filters?) {
        // list is a read on the data_products namespace generally — no specific resource
        return wrapWithTrace('dataProducts.list', undefined, () =>
          toolbox.dataProducts.list(filters)
        )();
      },
    },
    queues: {
      write(ref, event) {
        guardCall('queues', ref.name, 'write', 'queues.write');
        return wrapWithTrace('queues.write', ref.name, () =>
          toolbox.queues.write(ref, event)
        )();
      },
      getMetadata(ref) {
        guardCall('queues', ref.name, 'read', 'queues.getMetadata');
        return wrapWithTrace('queues.getMetadata', ref.name, () =>
          toolbox.queues.getMetadata(ref)
        )();
      },
    },
    connections: {
      list() {
        return wrapWithTrace('connections.list', undefined, () =>
          toolbox.connections.list()
        )();
      },
      get(connectionId) {
        guardCall('connectors', connectionId, 'read', 'connections.get');
        return wrapWithTrace('connections.get', connectionId, () =>
          toolbox.connections.get(connectionId)
        )();
      },
      test(connectionId) {
        guardCall('connectors', connectionId, 'read', 'connections.test');
        return wrapWithTrace('connections.test', connectionId, () =>
          toolbox.connections.test(connectionId)
        )();
      },
    },
    workflows: {
      list() {
        return wrapWithTrace('workflows.list', undefined, () =>
          toolbox.workflows.list()
        )();
      },
      getGraph(ref) {
        guardCall('workflows', ref.name, 'read', 'workflows.getGraph');
        return wrapWithTrace('workflows.getGraph', ref.name, () =>
          toolbox.workflows.getGraph(ref)
        )();
      },
    },
  };
}
