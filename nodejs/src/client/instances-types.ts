/**
 * Instances API types.
 * Backend: organizations microservice /organizations/instances.
 */

export interface Instance {
  instance_id: string;
  organization_id: string;
  name: string;
  api_url: string;
  region: string;
  stack_id: string;
  status: string;
  connection_details: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InstancesListResponse {
  success: true;
  data: {
    items: Instance[];
    pagination: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
  };
}

export interface InstanceDetailResponse {
  success: true;
  data: {
    instance: Instance;
    organization_id?: string;
    deployment_events?: unknown[];
  };
}
