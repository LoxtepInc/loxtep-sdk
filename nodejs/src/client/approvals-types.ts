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
  /** Steward inbox projection — required approvals for m-of-n gates. */
  required_approvals?: number;
  /** Steward inbox projection — optional criteria schema for structured decisions. */
  criteria_schema?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalsListResponse {
  items: ApprovalRequest[];
  /** Present when REST returns a bare `{ items, total }` list envelope. */
  total?: number;
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

/** Body fields for approve/reject (REST parity beyond MCP's empty POST). */
export interface ApprovalsResolveOptions {
  organization_id?: string;
  /** criteria_schema decision value; defaults server-side when omitted */
  response?: string;
  form_response?: Record<string, unknown> | null;
  /**
   * Accepted by REST Zod today; AO approve/reject handlers do not persist it yet.
   * Included for forward compatibility — do not rely on it until the platform wires it.
   */
  decision_note?: string;
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
