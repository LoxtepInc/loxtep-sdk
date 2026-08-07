/**
 * Deployment status records (MCP: loxtep_observe → list_deployments / get_deployment).
 * Backend: GET /workflows/deployments, GET /workflows/deployments/{deployment_id}.
 */

export type DeploymentStatus =
  | 'pending'
  | 'in_progress'
  | 'deployed'
  | 'failed'
  | 'rolled_back'
  | 'archived';

export type DeploymentType = 'workflow' | 'bot';

export type OrphanReason =
  | 'workflow_missing'
  | 'workflow_deleted'
  | 'workflow_archived'
  | 'project_missing';

export interface Deployment {
  deployment_id: string;
  project_id: string;
  instance_id: string;
  name: string;
  type: DeploymentType;
  status: DeploymentStatus;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  orphaned?: boolean;
  orphan_reason?: OrphanReason | null;
  runtime_mapping?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DeploymentsListFilters {
  project_id?: string;
  workflow_id?: string;
  instance_id?: string;
  status?: DeploymentStatus;
  type?: DeploymentType;
  orphaned?: boolean;
  page?: number;
  page_size?: number;
  sort_by?: 'created_at' | 'updated_at' | 'name';
  sort_order?: 'asc' | 'desc';
}

export interface DeploymentsListResponse {
  items: Deployment[];
  pagination?: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface GetDeploymentOptions {
  include_versions?: boolean;
}
