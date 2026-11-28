import { createSemanticGroundingApi } from "./semantic-grounding.js";
import type { LoxtepHttpClient } from "../http/client.js";
it("preserves blocked decisions and receipts instead of treating confidence as authorization", async () => {
  const calls: unknown[] = [];
  const result = {
    answer: "Review meaning",
    confidence: 0,
    sources: [],
    answerability: { status: "blocked" },
    outcome: "blocked",
    metadata: {},
  };
  const api = createSemanticGroundingApi({
    post: async (...args: unknown[]) => {
      calls.push(args);
      return { success: true, data: result };
    },
  } as unknown as LoxtepHttpClient);
  expect(
    await api.query({ question: "Revenue", data_product_ids: ["product"] }),
  ).toBe(result);
  expect(calls).toEqual([
    [
      "/ai/context/query",
      { question: "Revenue", data_product_ids: ["product"] },
    ],
  ]);
});
it("preflight forwards explicit scope and never chains into execution", async () => {
  const calls: unknown[] = [];
  const result = {
    decision: { status: "ready" },
    context_fingerprint: "abc",
    execution_authorized: false,
  };
  const api = createSemanticGroundingApi({
    post: async (...args: unknown[]) => {
      calls.push(args);
      return { success: true, data: result };
    },
  } as unknown as LoxtepHttpClient);
  expect(
    (await api.checkReadiness({ data_product_ids: ["product"] }))
      .execution_authorized,
  ).toBe(false);
  await api.checkAnswerability({
    question: "Revenue",
    data_product_ids: ["product"],
  });
  expect(calls).toEqual([
    ["/ai/context/readiness", { data_product_ids: ["product"] }],
    [
      "/ai/context/answerability",
      { question: "Revenue", data_product_ids: ["product"] },
    ],
  ]);
});
