/**
 * Instances API. list, get, get_stream_config, plus the self-hosted install
 * onboarding operations: create, get_deployment_urls, register_infrastructure,
 * get_infrastructure.
 * Backend: organizations microservice /organizations/instances +
 *   /organizations/{id}/deployment-urls + /organizations/{id}/infrastructure.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import { parseInstanceDetailResponse } from './instance-detail-response.js';
import { parseInstancesListResponse } from './instances-list-response.js';
import type {
  Instance,
  InstanceStreamConfig,
  InstancesListResponse,
  InstanceCreateInput,
  InstanceCreateResponse,
  DeploymentUrlsResponse,
  OnboardingPackage,
  RegisterInfrastructureInput,
  RegisterInfrastructureResponse,
  GetInfrastructureResponse,
} from './instances-types.js';
import { fetchInstanceStreamConfig, type InstanceStreamConfigSource } from '../lib/instance-stream-config.js';

const INSTANCES_BASE = '/organizations/instances';

export type { InstanceStreamConfig } from './instances-types.js';

/**
 * Normalizes a `/organizations/{id}/deployment-urls` or
 * `/organizations/{id}/infrastructure` response into the inner `data`
 * object (handles both wrapped-success `{ success, data }` and bare shapes).
 */
function unwrap<T>(res: unknown): T {
  const r = res as { success?: boolean; data?: T } | T;
  if (r && typeof r === 'object' && 'data' in (r as Record<string, unknown>)) {
    return (r as { data: T }).data ?? (r as T);
  }
  return r as T;
}

/**
 * Create the instances API surface.
 */
export function createInstancesApi(http: LoxtepHttpClient, organization_id?: string): {
  list: () => Promise<{
    items: Instance[];
    pagination: InstancesListResponse['data']['pagination'];
  }>;
  get: (instance_id: string) => Promise<Instance>;
  get_stream_config: (
    instance_id: string,
    options?: { instance?: Instance }
  ) => Promise<{ config: InstanceStreamConfig; source: InstanceStreamConfigSource }>;
  create: (input: InstanceCreateInput) => Promise<{
    instance_id: string | undefined;
    correlation_id: string | undefined;
    message: string;
  }>;
  get_deployment_urls: (orgId?: string) => Promise<OnboardingPackage>;
  get_infrastructure: (orgId?: string) => Promise<{
    cross_account_role_arn: string | null;
    external_id: string | null;
    preferred_region: string | null;
    infrastructure_registered_at: string | null;
  }>;
  register_infrastructure: (
    body: RegisterInfrastructureInput,
    orgId?: string
  ) => Promise<{
    organization_id: string | undefined;
    cross_account_role_arn: string;
    external_id: string;
    region: string;
    registered_at: string;
  }>;
} {
  // Resolve the path org id once: explicit arg overrides the client config.
  const resolveOrgId = (arg?: string): string => {
    const id = arg ?? organization_id;
    if (!id) {
      throw new Error(
        'Self-hosted onboarding operations need an organization_id. Pass --org-id, set LOXTEP_ORGANIZATION_ID, or run `loxtep whoami` and copy from the output.'
      );
    }
    return id;
  };

  return {
    async list() {
      const res = await http.get<unknown>(INSTANCES_BASE);
      return parseInstancesListResponse(res);
    },

    async get(instance_id: string): Promise<Instance> {
      const res = await http.get<unknown>(
        `${INSTANCES_BASE}/${encodeURIComponent(instance_id)}`
      );
      return parseInstanceDetailResponse(res);
    },

    /**
     * Resolve stream bus configuration for an instance.
     * Tries organizations stream-config, observe proxy, then inline instance metadata.
     */
    async get_stream_config(
      instance_id: string,
      options?: { instance?: Instance }
    ): Promise<{ config: InstanceStreamConfig; source: InstanceStreamConfigSource }> {
      return fetchInstanceStreamConfig(http, instance_id, options);
    },

    /**
     * Create a new Loxtep instance (POST /organizations/instances).
     * `input` matches the MCP `create_instance` flat shape; the platform maps
     * it internally to { instance_config, payment_method_id }.
     * Returns the instance_id + correlation_id immediately; provisioning runs
     * asynchronously (poll `list()` or `get()` for `status: active`).
     */
    async create(input: InstanceCreateInput) {
      const res = await http.post<InstanceCreateResponse>(INSTANCES_BASE, input);
      const result = res?.data ?? (res as unknown as InstanceCreateResponse['data']);
      return {
        instance_id: result?.instance_id ?? result?.instance?.instance_id,
        correlation_id: result?.correlation_id,
        message: result?.message ?? 'Instance creation queued. Provisioning runs asynchronously.',
      };
    },

    /**
     * Step 1 of the self-hosted install flow:
     * GET /organizations/{id}/deployment-urls → returns the one-click
     * CloudFormation URL, CLI command, Terraform code, template download URL,
     * the external ID, and the Loxtep AWS account ID. The platform also
     * materializes `external_id` into Secrets Manager — required by
     * `SelfHostedInstanceProvisioner.getExternalId()` at deploy time.
     */
    async get_deployment_urls(orgIdArg?: string) {
      const orgId = resolveOrgId(orgIdArg);
      const res = await http.get<DeploymentUrlsResponse>(
        `/organizations/organizations/${encodeURIComponent(orgId)}/deployment-urls`
      );
      // Handle both snake_case (raw platform response) and camelCase (frontend
      // axios interceptors) variants.
      const data = unwrap<OnboardingPackage>(res);
      return data;
    },

    /**
     * Optional check for the self-hosted install flow:
     * GET /organizations/{id}/infrastructure → returns the registered
     * cross-account role ARN + external ID, or null fields when the org has
     * not registered infrastructure yet.
     */
    async get_infrastructure(orgIdArg?: string) {
      const orgId = resolveOrgId(orgIdArg);
      const res = await http.get<GetInfrastructureResponse>(
        `/organizations/organizations/${encodeURIComponent(orgId)}/infrastructure`
      );
      const data = unwrap<{
        cross_account_role_arn?: string | null;
        external_id?: string | null;
        preferred_region?: string | null;
        infrastructure_registered_at?: string | null;
      }>(res);
      return {
        cross_account_role_arn: data?.cross_account_role_arn ?? null,
        external_id: data?.external_id ?? null,
        preferred_region: data?.preferred_region ?? null,
        infrastructure_registered_at: data?.infrastructure_registered_at ?? null,
      };
    },

    /**
     * Step 3 of the self-hosted install flow:
     * PUT /organizations/{id}/infrastructure → registers the cross-account
     * IAM role ARN at the organization level so the self-hosted provisioner
     * can find it via `SelfHostedInstanceProvisioner.getCustomerRoleArn()`.
     * Required before `create({ instance_type: 'self-hosted', ... })`.
     */
    async register_infrastructure(body: RegisterInfrastructureInput, orgIdArg?: string) {
      const orgId = resolveOrgId(orgIdArg);
      const res = await http.put<RegisterInfrastructureResponse>(
        `/organizations/organizations/${encodeURIComponent(orgId)}/infrastructure`,
        body
      );
      const data = unwrap<{
        organization_id?: string;
        cross_account_role_arn?: string;
        external_id?: string;
        region?: string;
        registered_at?: string;
      }>(res);
      return {
        organization_id: data?.organization_id,
        cross_account_role_arn: data?.cross_account_role_arn ?? body.cross_account_role_arn,
        external_id: data?.external_id ?? '',
        region: data?.region ?? body.region ?? '',
        registered_at: data?.registered_at ?? new Date().toISOString(),
      };
    },
  };
}