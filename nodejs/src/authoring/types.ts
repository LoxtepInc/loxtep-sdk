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
 * Spec for a Human Approval Node in the workflow graph.
 * Events pause at this node pending a human decision, then route to
 * an approved or rejected downstream path.
 */
export interface ApprovalNodeSpec {
  kind: 'approval';
  /** Node name, 1–128 characters. */
  name: string;
  /** Approval channel identifier, 1–256 characters. */
  approvalChannel: string;
  /** Hours before the approval request expires, 1–168. */
  timeoutHours: number;
  /** Optional human-readable description. */
  description?: string;
  /** Name of the upstream node feeding events into this node. */
  upstream: string;
  /** Name of the downstream node receiving approved events. */
  approved?: string;
  /** Name of the downstream node receiving rejected/expired events. */
  rejected?: string;
}

/**
 * Spec for an Agent Node in the workflow graph.
 * Each event is processed by an AI model; the structured result flows downstream.
 */
export interface AgentNodeSpec {
  kind: 'agent';
  /** Node name, 1–128 characters. */
  name: string;
  /** Model identifier, 1–256 characters. */
  modelId: string;
  /** Prompt template rendered with event data, 1–10000 characters. */
  promptTemplate: string;
  /** Maximum seconds to wait for model response, 1–300. Defaults to 30. */
  timeoutSeconds?: number;
  /** JSON Schema describing expected model output structure, ≤50KB. */
  outputSchema?: object;
  /** Optional human-readable description. */
  description?: string;
  /** Name of the upstream node feeding events into this node. */
  upstream: string;
  /** Name of the downstream node receiving failed invocation events. */
  error?: string;
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
  /** Declarative graph nodes (approval gates, agent invocations) compiled to graph ops on deploy (R9.3). */
  nodes?: Array<ApprovalNodeSpec | AgentNodeSpec>;
}
