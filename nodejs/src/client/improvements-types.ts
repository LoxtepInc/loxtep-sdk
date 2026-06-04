/**
 * Improvements API types.
 * Canonical API: GET /ai/improvements, POST /ai/improvements (action: apply|reject).
 * snake_case per backend conventions.
 *
 * Requirements: 8.1, 8.3, 8.4, 8.5, 8.6
 */

/** Status of an Improvement (R8.1). */
export type ImprovementStatus = 'proposed' | 'applied' | 'rejected';

/** An Improvement entity as returned by the API (R8.1). */
export interface Improvement {
  id: string;
  organization_id: string;
  workflow_name: string;
  source_eval_run_ids: string[];
  proposed_change: string;
  rationale: string | null;
  status: ImprovementStatus;
  created_at: string;
  updated_at: string;
}

/** Filters for listing improvements (GET /ai/improvements query params). */
export interface ImprovementsListFilters {
  /** Filter by status. */
  status?: ImprovementStatus;
  /** Filter by workflow name. */
  workflow_name?: string;
  /** Max results per page (1–100, default 50). */
  limit?: number;
  /** Cursor for pagination (created_at of last item). */
  cursor?: string;
}

/** Response shape from GET /ai/improvements. */
export interface ImprovementsListResponse {
  success: boolean;
  data: {
    improvements: Improvement[];
    cursor: string | null;
  };
}

/** Request body for POST /ai/improvements (apply or reject). */
export interface ImprovementActionInput {
  id: string;
  action: 'apply' | 'reject';
}

/** Response shape from POST /ai/improvements (apply/reject). */
export interface ImprovementActionResponse {
  success: boolean;
  data: {
    id: string;
    status: 'applied' | 'rejected';
    updated_at: string;
  };
}
