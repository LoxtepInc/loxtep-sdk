import type { LoxtepHttpClient } from "../http/client.js";
import type {
  SemanticGroundingAnswerability,
  GroundingReceipt,
  GroundedQueryOutcome,
} from "./semantic-grounding-types.js";
export interface SemanticScope {
  data_product_ids: string[];
  relationship_roles?: string[];
}
export interface SemanticPreflightResult {
  decision: SemanticGroundingAnswerability;
  context_fingerprint: string | null;
  execution_authorized: false;
}
export interface GroundedContextQueryInput {
  question: string;
  data_product_ids?: string[];
  options?: {
    backends?: Array<"graph" | "analytics" | "vector" | "catalog">;
    max_results?: number;
    include_plan?: boolean;
  };
}
export interface GroundedContextQueryResult {
  answer: string;
  confidence: number;
  sources: unknown[];
  answerability?: SemanticGroundingAnswerability;
  grounding?: GroundingReceipt;
  outcome?: GroundedQueryOutcome;
  rows?: Record<string, unknown>[];
  columns?: string[];
  metadata: Record<string, unknown>;
  plan?: unknown;
}
/** Identities and rollout mode are server-owned. A preflight never grants execution. */
export function createSemanticGroundingApi(http: LoxtepHttpClient) {
  return {
    async query(
      input: GroundedContextQueryInput,
    ): Promise<GroundedContextQueryResult> {
      return (
        await http.post<{ success: true; data: GroundedContextQueryResult }>(
          "/ai/context/query",
          input,
        )
      ).data;
    },
    async checkReadiness(
      input: SemanticScope & { metric_names?: string[] },
    ): Promise<SemanticPreflightResult> {
      return (
        await http.post<{ success: true; data: SemanticPreflightResult }>(
          "/ai/context/readiness",
          input,
        )
      ).data;
    },
    async checkAnswerability(
      input: SemanticScope & { question: string },
    ): Promise<SemanticPreflightResult> {
      return (
        await http.post<{ success: true; data: SemanticPreflightResult }>(
          "/ai/context/answerability",
          input,
        )
      ).data;
    },
  };
}
