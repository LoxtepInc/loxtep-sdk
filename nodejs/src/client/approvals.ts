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
  ApprovalsResolveOptions,
  ApprovalDecisionResult,
} from './approvals-types.js';

function unwrap<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function normalizeResolveOptions(
  organization_idOrOptions?: string | ApprovalsResolveOptions
): ApprovalsResolveOptions {
  if (typeof organization_idOrOptions === 'string') {
    return { organization_id: organization_idOrOptions };
  }
  return organization_idOrOptions ?? {};
}

function buildResolveBody(options: ApprovalsResolveOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (options.response !== undefined) body.response = options.response;
  if (options.form_response !== undefined) body.form_response = options.form_response;
  if (options.decision_note !== undefined) body.decision_note = options.decision_note;
  return body;
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
    organization_idOrOptions?: string | ApprovalsResolveOptions
  ) => Promise<ApprovalDecisionResult>;
  approve: (
    approval_request_id: string,
    options?: ApprovalsResolveOptions
  ) => Promise<ApprovalDecisionResult>;
  reject: (
    approval_request_id: string,
    options?: ApprovalsResolveOptions
  ) => Promise<ApprovalDecisionResult>;
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
      const out: ApprovalsListResponse = {
        items: payload.items ?? [],
        pagination: payload.pagination,
      };
      if (payload.total != null) out.total = payload.total;
      return out;
    },

    list_pending(organization_id?: string): Promise<ApprovalsListResponse> {
      return this.list({ status: 'pending', organization_id });
    },

    async resolve(
      approval_request_id: string,
      action: 'approve' | 'reject',
      organization_idOrOptions?: string | ApprovalsResolveOptions
    ): Promise<ApprovalDecisionResult> {
      const options = normalizeResolveOptions(organization_idOrOptions);
      const org = resolveOrg(options.organization_id);
      const res = await http.post<ApprovalDecisionResult>(
        `${base(org)}/${encodeURIComponent(approval_request_id)}/${action}`,
        buildResolveBody(options)
      );
      return unwrap<ApprovalDecisionResult>(res);
    },

    approve(
      approval_request_id: string,
      options?: ApprovalsResolveOptions
    ): Promise<ApprovalDecisionResult> {
      return this.resolve(approval_request_id, 'approve', options);
    },

    reject(
      approval_request_id: string,
      options?: ApprovalsResolveOptions
    ): Promise<ApprovalDecisionResult> {
      return this.resolve(approval_request_id, 'reject', options);
    },
  };
}
