/**
 * Code-first data workflow authoring surface.
 *
 * Entry points:
 * - `defineDataWorkflow` — validates and returns a `DataWorkflowModule` spec
 * - `on` — trigger builders (`queueEvent`, `connectorEvent`, `schedule`, `webhook`)
 * - `createToolbox` — deterministic typed platform calls (no model in the loop)
 * - `agent` — agentic operation entry point with scope enforcement and action trace
 */

export { defineDataWorkflow } from './define-data-workflow.js';
export { on } from './triggers.js';
export { createToolbox, ToolboxOperationError } from './toolbox.js';
export {
  agent,
  validateAgentOptions,
  computeReachableScope,
  enforceAgentScope,
  createScopeGuardedToolbox,
  ActionTrace,
  AgentScopeError,
} from './agent.js';
export type {
  DataWorkflowModule,
  TriggerSpec,
  QueueRef,
  ConnectorRef,
  HandlerContext,
} from './types.js';
export { compileModule, computeRemovalSet } from './compiler.js';
export type {
  GraphPatchOp,
  ResourceRef,
  CompiledWorkflow,
} from './compiler.js';
export type {
  Toolbox,
  ToolboxDataProducts,
  ToolboxQueues,
  ToolboxConnections,
  ToolboxWorkflows,
  CreateToolboxOptions,
  DataProductRef,
  WorkflowRef,
  WriteResult,
  QueryRows,
} from './toolbox.js';
export type {
  SkillRef,
  AgentOptions,
  ActionOutcome,
  ActionTraceEntry,
  AgentResult,
  AgentExecutionContext,
} from './agent.js';
