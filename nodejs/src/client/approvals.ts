/**
 * Approvals API — list pending approval requests and resolve them (approve/reject).
 * The same decision the web inbox and Slack/email buttons make, resolving the shared
 * approval record. Backend: agent-orchestration approval-requests REST API.
 *
 *   GET  /agent-orchestration/organizations/{org}/approval-requests?status=pending
 *   POST /agent-orchestration/organizations/{org}/approval-requests/{id}/approve|reject
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  ApprovalsApiDeps,
  ApprovalsListFilters,
  ApprovalsListResponse,
  ApprovalDecisionResult,
} from './approvals-types.js';

function unwrap<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

export function createApprovalsApi(
  http: LoxtepHttpClient,
  deps: ApprovalsApiDeps = {}
): {
  list: (filters?: ApprovalsListFilters) => Promise<ApprovalsListResponse>;
  list_pending: (organization_id?: string) => Promise<ApprovalsListResponse>;
  resolve: (
    approval_request_id: string,
    action: 'approve' | 'reject',
    organization_id?: string
  ) => Promise<ApprovalDecisionResult>;
  approve: (approval_request_id: string, organization_id?: string) => Promise<ApprovalDecisionResult>;
  reject: (approval_request_id: string, organization_id?: string) => Promise<ApprovalDecisionResult>;
} {
  const resolveOrg = (override?: string): string => {
    const org = override ?? deps.organization_id;
    if (!org) {
      throw new Error(
        'organization_id is required for approvals calls (set it on the client or pass it explicitly)'
      );
    }
    return org;
  };

  const base = (org: string) =>
    `/agent-orchestration/organizations/${encodeURIComponent(org)}/approval-requests`;

  return {
    async list(filters: ApprovalsListFilters = {}): Promise<ApprovalsListResponse> {
      const org = resolveOrg(filters.organization_id);
      const search = new URLSearchParams();
      if (filters.status) search.set('status', filters.status);
      if (filters.page != null) search.set('page', String(filters.page));
      if (filters.page_size != null) search.set('page_size', String(filters.page_size));
      const qs = search.toString() ? `?${search.toString()}` : '';
      const res = await http.get<ApprovalsListResponse>(`${base(org)}${qs}`);
      const payload = unwrap<ApprovalsListResponse>(res);
      return { items: payload.items ?? [], pagination: payload.pagination };
    },

    list_pending(organization_id?: string): Promise<ApprovalsListResponse> {
      return this.list({ status: 'pending', organization_id });
    },

    async resolve(
      approval_request_id: string,
      action: 'approve' | 'reject',
      organization_id?: string
    ): Promise<ApprovalDecisionResult> {
      const org = resolveOrg(organization_id);
      const res = await http.post<ApprovalDecisionResult>(
        `${base(org)}/${encodeURIComponent(approval_request_id)}/${action}`,
        {}
      );
      return unwrap<ApprovalDecisionResult>(res);
    },

    approve(approval_request_id: string, organization_id?: string): Promise<ApprovalDecisionResult> {
      return this.resolve(approval_request_id, 'approve', organization_id);
    },

    reject(approval_request_id: string, organization_id?: string): Promise<ApprovalDecisionResult> {
      return this.resolve(approval_request_id, 'reject', organization_id);
    },
  };
}
