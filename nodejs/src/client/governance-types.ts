/**
 * Governance policies and access requests.
 * Policies: /governance/policies (not /governance/standards).
 * Access requests: /governance/access-requests.
 */

export interface GovernanceApiDeps {
  /** Client organization. Required for these calls; not sent on the path. */
  organization_id?: string;
}

export type PolicyRuleAction = 'allow' | 'deny' | 'require_approval';

/** `strict` is a legacy alias the platform normalizes to `block`. */
export type PolicyEnforcement = 'block' | 'warn' | 'audit' | 'strict';

export interface PolicyRule {
  id?: string;
  condition: string;
  action: PolicyRuleAction;
  resources: string[];
}

export interface PolicyScope {
  domains?: string[];
  dataProducts?: string[];
  users?: string[];
}

export interface GovernancePolicy {
  policy_id?: string;
  name?: string;
  description?: string;
  domain_id?: string | null;
  type?: string;
  status?: string;
  tags?: string[];
  rules?: PolicyRule[];
  scope?: PolicyScope;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  enforcement?: string;
  requires_approval?: boolean;
  approval_threshold?: number;
  [key: string]: unknown;
}

export interface PolicyListFilters {
  organization_id?: string;
  page?: number;
  page_size?: number;
  search?: string;
  domain_id?: string;
  include_org_policies?: boolean;
  type?: string;
}

export interface PolicyListResult {
  items?: GovernancePolicy[];
  pagination?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CreatePolicyInput {
  name: string;
  description?: string;
  domain_id?: string;
  /** Omitted when absent; the platform defaults to `data_governance`. */
  type?: string;
  status?: string;
  tags?: string[];
  rules: PolicyRule[];
  scope?: PolicyScope;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  enforcement?: PolicyEnforcement;
  requires_approval?: boolean;
  approval_threshold?: number;
  organization_id?: string;
}

export type UpdatePolicyInput = Partial<CreatePolicyInput> & {
  /** Stripped before the request. The id belongs on the path only. */
  policy_id?: string;
};

export type AccessResourceType = 'domain' | 'data_product' | 'connector';

export type AccessType =
  | 'owner'
  | 'steward'
  | 'engineer'
  | 'member'
  | 'viewer'
  | 'consume'
  | 'use';

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface AccessRequest {
  access_request_id?: string;
  resource_type?: string;
  resource_id?: string;
  access_type?: string;
  status?: AccessRequestStatus | string;
  justification?: string;
  rejection_reason?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CreateAccessRequestInput {
  resource_type: AccessResourceType;
  resource_id: string;
  access_type: AccessType;
  justification?: string;
  metadata?: Record<string, unknown>;
  organization_id?: string;
}

export interface AccessRequestListFilters {
  organization_id?: string;
  page?: number;
  page_size?: number;
  status?: AccessRequestStatus;
  resource_type?: AccessResourceType;
  resource_id?: string;
}

export interface AccessRequestListResult {
  items?: AccessRequest[];
  pagination?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DecideAccessRequestInput {
  action: 'approve' | 'reject';
  rejection_reason?: string;
  /** Stripped before the request. The id belongs on the path only. */
  access_request_id?: string;
  organization_id?: string;
}
