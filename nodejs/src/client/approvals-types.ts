/**
 * Approvals API types — programmatic parity with the web inbox and Slack/email for
 * pipeline HITL gates. Backed by the agent-orchestration approval-requests REST API.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  approval_request_id: string;
  organization_id: string;
  workflow_name: string;
  operation_name: string;
  target_resource: string;
  requesting_actor: string;
  status: ApprovalStatus;
  expires_at: string;
  decided_by_user_id: string | null;
  decided_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ApprovalsListResponse {
  items: ApprovalRequest[];
  pagination?: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface ApprovalDecisionResult {
  approval_request_id: string;
  status: string;
  decided_at?: string;
}

export interface ApprovalsApiDeps {
  /** Default organization for approval calls; overridable per call. */
  organization_id?: string;
}

export interface ApprovalsListFilters {
  status?: ApprovalStatus;
  organization_id?: string;
  page?: number;
  page_size?: number;
}
