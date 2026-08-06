/**
 * Workflows API types for listWorkflows, getWorkflowGraph, createWorkflow, deploy.
 * snake_case per backend conventions. Backend: workflows microservice.
 */

import type { Flow, FlowsListFilters, FlowCreateInput } from './flow-types.js';

export type WorkflowsListFilters = FlowsListFilters;

export interface WorkflowsListResponse {
  success: true;
  data: {
    items: Flow[];
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  };
}

export interface WorkflowGraphNode {
  node_id: string;
  workflow_id: string;
  type: string;
  [key: string]: unknown;
}

export interface WorkflowGraphEdge {
  source_node_id: string;
  target_node_id: string;
  [key: string]: unknown;
}

export interface WorkflowGraph {
  workflow_id: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  [key: string]: unknown;
}

export interface GetWorkflowGraphResponse {
  success: true;
  data: WorkflowGraph;
}

export interface DeployInput {
  project_id: string;
  instance_id: string;
  version_id?: string;
  force_redeploy?: boolean;
}

export interface DeployResponse {
  success: true;
  data: {
    /** async_runs.run_id for deploy fan-out tracking (preferred). */
    run_id?: string;
    /** Alias of run_id; older mock/clients used this name. */
    deployment_id?: string;
    version_id?: string;
    status: string;
    message?: string;
    project_id?: string;
  };
}

/**
 * Normalize a deploy API body to the flat DeployResponse.data shape.
 *
 * Handles:
 * - `{ success, data: { run_id, status, ... } }` (current contract)
 * - historical double-nested `{ data: { success, data: { status, ... } } }` mishaps
 * - already-unwrapped `{ run_id|deployment_id|status, ... }`
 */
export function normalizeDeployResponse(raw: unknown): DeployResponse['data'] {
  let cur: unknown = raw;
  for (let depth = 0; depth < 5; depth++) {
    if (!cur || typeof cur !== 'object') break;
    const obj = cur as Record<string, unknown>;
    const hasTrackingField =
      typeof obj.run_id === 'string' ||
      typeof obj.deployment_id === 'string' ||
      typeof obj.status === 'string' ||
      typeof obj.message === 'string';
    if (hasTrackingField && !('data' in obj && obj.data && typeof obj.data === 'object' && !('status' in obj))) {
      break;
    }
    if ('data' in obj && obj.data != null && typeof obj.data === 'object') {
      cur = obj.data;
      continue;
    }
    break;
  }

  const obj =
    cur && typeof cur === 'object' ? (cur as Record<string, unknown>) : ({} as Record<string, unknown>);
  const run_id =
    typeof obj.run_id === 'string'
      ? obj.run_id
      : typeof obj.deployment_id === 'string'
        ? obj.deployment_id
        : undefined;
  const deployment_id =
    typeof obj.deployment_id === 'string'
      ? obj.deployment_id
      : typeof obj.run_id === 'string'
        ? obj.run_id
        : undefined;

  return {
    run_id,
    deployment_id,
    version_id: typeof obj.version_id === 'string' ? obj.version_id : undefined,
    status: typeof obj.status === 'string' ? obj.status : 'unknown',
    message: typeof obj.message === 'string' ? obj.message : undefined,
    project_id: typeof obj.project_id === 'string' ? obj.project_id : undefined,
  };
}

export type CreateWorkflowInput = FlowCreateInput;

export interface SaveWorkflowBundleInput {
  files: Record<string, Record<string, unknown>>;
  dry_run?: boolean;
}

export interface WorkflowBundleCreatedEntity {
  entity_type: string;
  entity_id: string;
  path: string;
}

export interface WorkflowBundleValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface SaveWorkflowBundleResult {
  success: true;
  dry_run?: boolean;
  workflow_id: string;
  created_entities: WorkflowBundleCreatedEntity[];
  validation_errors?: WorkflowBundleValidationError[];
  relationship_errors?: WorkflowBundleValidationError[];
  topology_errors?: WorkflowBundleValidationError[];
  validation_error?: string;
}

export interface SaveWorkflowBundleResponse {
  success: true;
  data: SaveWorkflowBundleResult;
}
