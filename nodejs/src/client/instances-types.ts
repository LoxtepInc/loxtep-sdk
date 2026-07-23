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
  /** Production returns the instance directly; mocks may wrap `{ instance, organization_id?, deployment_events? }`. */
  data: Instance | {
    instance: Instance;
    organization_id?: string;
    deployment_events?: unknown[];
  };
}

// ---------------------------------------------------------------------------
// Self-hosted install onboarding types — mirror the platform API responses.
// Backend: GET /organizations/{id}/deployment-urls, GET/PUT /organizations/{id}/infrastructure.
// ---------------------------------------------------------------------------

export type InstanceType = 'shared' | 'managed' | 'self-hosted';

/** POST /organizations/instances flat body — matches MCP `create_instance` flat input. */
export interface InstanceCreateInput {
  name: string;
  region: string;
  instance_type: InstanceType;
  plan_id?: string;
  payment_method_id?: string;
  connection_details?: {
    observe_api?: {
      cross_account_role_arn?: string;
      rstreams_secret_arn?: string;
      rstreams_auth_arn?: string;
      external_id?: string;
      namespace?: string;
    };
  };
}

/** POST /organizations/instances response (async queued). */
export interface InstanceCreateResponse {
  success?: boolean;
  data?: {
    instance_id?: string;
    correlation_id?: string;
    message?: string;
    instance?: { instance_id?: string };
  };
}

/** GET /organizations/{id}/deployment-urls response. */
export interface DeploymentUrlsResponse {
  success?: boolean;
  data?: OnboardingPackage | { success?: boolean };
}

export interface OnboardingPackage {
  organizationId?: string;
  externalId?: string;
  region?: string;
  loxtepAccountId?: string;
  deploymentOptions?: {
    oneClickUrl?: string;
    templateDownloadUrl?: string;
    cliCommand?: string;
    terraformCode?: string;
  };
  instructions?: {
    quickStart?: string;
    cli?: string;
    terraform?: string;
    manual?: string;
  };
  nextSteps?: string[];
  // snake_case variants emitted by the API (camelCase via axios interceptor in
  // the frontend; the SDK uses the raw snake_case response).
  organization_id?: string;
  external_id?: string;
  loxtep_account_id?: string;
  deployment_options?: {
    one_click_url?: string;
    template_download_url?: string;
    cli_command?: string;
    terraform_code?: string;
  };
}

/** PUT /organizations/{id}/infrastructure body. */
export interface RegisterInfrastructureInput {
  cross_account_role_arn: string;
  region?: string;
}

/** PUT /organizations/{id}/infrastructure response. */
export interface RegisterInfrastructureResponse {
  success?: boolean;
  data?: {
    organization_id?: string;
    cross_account_role_arn?: string;
    external_id?: string;
    region?: string;
    registered_at?: string;
  };
}

/** GET /organizations/{id}/infrastructure response. */
export interface GetInfrastructureResponse {
  success?: boolean;
  data?: {
    organization_id?: string;
    cross_account_role_arn?: string | null;
    external_id?: string | null;
    preferred_region?: string | null;
    infrastructure_registered_at?: string | null;
  };
}
