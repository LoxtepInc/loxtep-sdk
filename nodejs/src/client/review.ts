/**
 * Review facade (MCP: loxtep_review).
 * Delegates to approvals, improvements, and CDLC APIs.
 */

import type { createApprovalsApi } from './approvals.js';
import type { CdlcApi } from './cdlc.js';
import type { ImprovementsApi } from './improvements.js';

export interface ReviewFacadeDeps {
  approvals: ReturnType<typeof createApprovalsApi>;
  improvements: ImprovementsApi;
  cdlc: CdlcApi;
}

export function createReviewFacade(deps: ReviewFacadeDeps): {
  approvals: ReviewFacadeDeps['approvals'];
  improvements: ReviewFacadeDeps['improvements'];
  cdlc: ReviewFacadeDeps['cdlc'];
} {
  return {
    approvals: deps.approvals,
    improvements: deps.improvements,
    cdlc: deps.cdlc,
  };
}

export type ReviewFacade = ReturnType<typeof createReviewFacade>;
