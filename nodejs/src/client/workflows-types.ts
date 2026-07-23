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
    deployment_id: string;
    version_id: string;
    status: string;
    message: string;
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
