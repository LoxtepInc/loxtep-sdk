/**
 * Types for the code-first data workflow authoring surface.
 *
 * A `DataWorkflowModule` is the developer-facing unit of authoring: it declares
 * a trigger, an optional filter, and a handler that compiles down to the existing
 * flow/workflow graph on deploy.
 */

/**
 * Trigger specification describing what event starts a workflow.
 */
export interface TriggerSpec {
  kind: 'queue' | 'connector' | 'schedule' | 'webhook';
  /** Typed constant reference from the generated artifact (queue or connector). */
  ref?: { id: string; name?: string };
  /** Cron expression, for kind:'schedule'. */
  schedule?: string;
  /** URL path, for kind:'webhook'. */
  path?: string;
}

/**
 * A typed queue constant from the Generated_SDK_Artifact.
 */
export interface QueueRef {
  id: string;
  name: string;
}

/**
 * A typed connector constant from the Generated_SDK_Artifact.
 */
export interface ConnectorRef {
  id: string;
  type: string;
}

/**
 * Context object passed to the handler function during execution.
 */
export interface HandlerContext {
  /** The workflow name. */
  workflowName: string;
  /** The attached instance ID. */
  instanceId: string;
  /** The project ID. */
  projectId: string;
}

/**
 * A code-first data workflow module declaration.
 * Created via `defineDataWorkflow()`.
 */
export interface DataWorkflowModule {
  /** Workflow name, 1–64 characters (R3.1, R3.8). */
  name: string;
  /** 1–10 triggers that start this workflow (R3.1, R3.8). */
  triggers: TriggerSpec[];
  /** Optional event filter predicate. */
  filter?: (event: unknown) => boolean;
  /** The workflow handler function. */
  handler: (ctx: HandlerContext, event: unknown) => Promise<void> | void;
  /** Operation names requiring human approval, ≤100 entries, each 1–256 chars (R6.1). */
  requireApproval?: string[];
}
