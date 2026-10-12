/**
 * Governance policies and access requests.
 * Standards stay on `client.define.standards` (`/governance/standards`).
 *
 *   GET    /governance/policies
 *   GET    /governance/policies/{policy_id}
 *   POST   /governance/policies
 *   PUT    /governance/policies/{policy_id}
 *   DELETE /governance/policies/{policy_id}
 *   POST   /governance/access-requests
 *   GET    /governance/access-requests
 *   PUT    /governance/access-requests/{access_request_id}
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  AccessRequest,
  AccessRequestListFilters,
  AccessRequestListResult,
  CreateAccessRequestInput,
  CreatePolicyInput,
  DecideAccessRequestInput,
  GovernanceApiDeps,
  GovernancePolicy,
  PolicyListFilters,
  PolicyListResult,
  UpdatePolicyInput,
} from './governance-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function requireOrg(deps: GovernanceApiDeps, override?: string): string {
  const org = override ?? deps.organization_id;
  if (!org) {
    throw new Error(
      'organization_id is required for governance calls (set it on the client or pass it explicitly)'
    );
  }
  return org;
}

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function definedBody(input: object, omit: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (omit.includes(key) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const BODY_OMIT = ['organization_id', 'policy_id', 'access_request_id'];

export interface GovernancePoliciesApi {
  list: (filters?: PolicyListFilters) => Promise<PolicyListResult>;
  get: (policy_id: string, organization_id?: string) => Promise<GovernancePolicy>;
  create: (input: CreatePolicyInput) => Promise<GovernancePolicy>;
  update: (policy_id: string, input: UpdatePolicyInput) => Promise<GovernancePolicy>;
  delete: (policy_id: string, organization_id?: string) => Promise<unknown>;
}

export interface GovernanceAccessRequestsApi {
  create: (input: CreateAccessRequestInput) => Promise<AccessRequest>;
  list: (filters?: AccessRequestListFilters) => Promise<AccessRequestListResult>;
  decide: (access_request_id: string, input: DecideAccessRequestInput) => Promise<AccessRequest>;
}

export interface GovernanceApi {
  policies: GovernancePoliciesApi;
  access_requests: GovernanceAccessRequestsApi;
}

export function createGovernanceApi(
  http: LoxtepHttpClient,
  deps: GovernanceApiDeps = {}
): GovernanceApi {
  const policies: GovernancePoliciesApi = {
    async list(filters: PolicyListFilters = {}): Promise<PolicyListResult> {
      requireOrg(deps, filters.organization_id);
      const qs = queryString({
        page: filters.page,
        page_size: filters.page_size,
        search: filters.search,
        domain_id: filters.domain_id,
        include_org_policies: filters.include_org_policies,
        type: filters.type,
      });
      const res = await http.get<unknown>(`/governance/policies${qs}`);
      return unwrapData<PolicyListResult>(res);
    },

    async get(policy_id: string, organization_id?: string): Promise<GovernancePolicy> {
      if (!policy_id) throw new Error('policy_id is required');
      requireOrg(deps, organization_id);
      const res = await http.get<unknown>(
        `/governance/policies/${encodeURIComponent(policy_id)}`
      );
      return unwrapData<GovernancePolicy>(res);
    },

    async create(input: CreatePolicyInput): Promise<GovernancePolicy> {
      requireOrg(deps, input.organization_id);
      const res = await http.post<unknown>('/governance/policies', definedBody(input, BODY_OMIT));
      return unwrapData<GovernancePolicy>(res);
    },

    async update(policy_id: string, input: UpdatePolicyInput): Promise<GovernancePolicy> {
      if (!policy_id) throw new Error('policy_id is required');
      requireOrg(deps, input.organization_id);
      const res = await http.put<unknown>(
        `/governance/policies/${encodeURIComponent(policy_id)}`,
        definedBody(input, BODY_OMIT)
      );
      return unwrapData<GovernancePolicy>(res);
    },

    async delete(policy_id: string, organization_id?: string): Promise<unknown> {
      if (!policy_id) throw new Error('policy_id is required');
      requireOrg(deps, organization_id);
      const res = await http.delete<unknown>(
        `/governance/policies/${encodeURIComponent(policy_id)}`
      );
      return unwrapData(res);
    },
  };

  const access_requests: GovernanceAccessRequestsApi = {
    async create(input: CreateAccessRequestInput): Promise<AccessRequest> {
      requireOrg(deps, input.organization_id);
      const res = await http.post<unknown>(
        '/governance/access-requests',
        definedBody(input, BODY_OMIT)
      );
      return unwrapData<AccessRequest>(res);
    },

    async list(filters: AccessRequestListFilters = {}): Promise<AccessRequestListResult> {
      requireOrg(deps, filters.organization_id);
      const qs = queryString({
        page: filters.page,
        page_size: filters.page_size,
        status: filters.status,
        resource_type: filters.resource_type,
        resource_id: filters.resource_id,
      });
      const res = await http.get<unknown>(`/governance/access-requests${qs}`);
      return unwrapData<AccessRequestListResult>(res);
    },

    async decide(
      access_request_id: string,
      input: DecideAccessRequestInput
    ): Promise<AccessRequest> {
      if (!access_request_id) throw new Error('access_request_id is required');
      requireOrg(deps, input.organization_id);
      const res = await http.put<unknown>(
        `/governance/access-requests/${encodeURIComponent(access_request_id)}`,
        definedBody(input, BODY_OMIT)
      );
      return unwrapData<AccessRequest>(res);
    },
  };

  return { policies, access_requests };
}
