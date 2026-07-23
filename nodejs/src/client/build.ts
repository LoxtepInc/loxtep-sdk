/**
 * Build facade (MCP: loxtep_workflows + loxtep_triggers + loxtep_data_products + loxtep_deployments).
 * Delegates to workflows, triggers, data_products CRUD, and targets APIs.
 */

import type { createWorkflowsApi, WorkflowsApi } from './workflows.js';
import type { createTriggersApi } from './triggers.js';
import type { createDataProductsApi } from './data-products.js';
import type { TargetsApi } from './targets.js';
import type { GetWriterOptions, FlowWriter } from './flow-types.js';

export interface BuildFacadeDeps {
  workflows: WorkflowsApi;
  triggers: ReturnType<typeof createTriggersApi>;
  data_products: ReturnType<typeof createDataProductsApi>;
  targets: TargetsApi;
}

export function createBuildFacade(deps: BuildFacadeDeps): {
  workflows: BuildFacadeDeps['workflows'];
  triggers: BuildFacadeDeps['triggers'];
  data_products: BuildFacadeDeps['data_products'];
  targets: BuildFacadeDeps['targets'];
  /** Low-level stream writer escape hatch — delegates to workflows.get_writer. */
  get_writer: (workflow_id: string, options: GetWriterOptions) => Promise<FlowWriter>;
} {
  return {
    workflows: deps.workflows,
    triggers: deps.triggers,
    data_products: deps.data_products,
    targets: deps.targets,
    get_writer: (workflow_id, options) => deps.workflows.get_writer(workflow_id, options),
  };
}

export type BuildFacade = ReturnType<typeof createBuildFacade>;
