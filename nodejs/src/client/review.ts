/**
 * Review facade (MCP: loxtep_approvals + improvements workflow).
 * Delegates to approvals and improvements APIs.
 */

import type { createApprovalsApi } from './approvals.js';
import type { ImprovementsApi } from './improvements.js';

export interface ReviewFacadeDeps {
  approvals: ReturnType<typeof createApprovalsApi>;
  improvements: ImprovementsApi;
}

export function createReviewFacade(deps: ReviewFacadeDeps): {
  approvals: ReviewFacadeDeps['approvals'];
  improvements: ReviewFacadeDeps['improvements'];
} {
  return {
    approvals: deps.approvals,
    improvements: deps.improvements,
  };
}

export type ReviewFacade = ReturnType<typeof createReviewFacade>;
