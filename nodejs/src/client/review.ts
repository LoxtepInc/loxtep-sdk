/**
 * Review facade (MCP: loxtep_review).
 * Delegates to approvals, improvements, CDLC, and context-mining APIs.
 */

import type { createApprovalsApi } from './approvals.js';
import type { CdlcApi } from './cdlc.js';
import type { ImprovementsApi } from './improvements.js';
import type { MiningApi } from './mining.js';

export interface ReviewFacadeDeps {
  approvals: ReturnType<typeof createApprovalsApi>;
  improvements: ImprovementsApi;
  cdlc: CdlcApi;
  mining: MiningApi;
}

export function createReviewFacade(deps: ReviewFacadeDeps): {
  approvals: ReviewFacadeDeps['approvals'];
  improvements: ReviewFacadeDeps['improvements'];
  cdlc: ReviewFacadeDeps['cdlc'];
  mining: ReviewFacadeDeps['mining'];
} {
  return {
    approvals: deps.approvals,
    improvements: deps.improvements,
    cdlc: deps.cdlc,
    mining: deps.mining,
  };
}

export type ReviewFacade = ReturnType<typeof createReviewFacade>;
