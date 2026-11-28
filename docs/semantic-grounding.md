# Grounded context queries

These methods require the matching semantic-grounding server release. Organization
rollout is controlled by the server; SDK callers cannot enable or bypass it.

```ts
const scope = { data_product_ids: [productId] };
const readiness = await client.context.checkReadiness(scope);
const advisory = await client.context.checkAnswerability({ ...scope, question: 'Show revenue' });
const result = await client.context.query({ ...scope, question: 'Show revenue' });
```

```python
scope = {"data_product_ids": [product_id]}
readiness = client.context.check_readiness(**scope)
advisory = client.context.check_answerability(question="Show revenue", **scope)
result = client.context.query(question="Show revenue", **scope)
# AsyncLoxtepClient exposes the same methods; await each call.
```

`checkReadiness` / `check_readiness` checks current reviewed meaning.
`checkAnswerability` / `check_answerability` is advisory and supports the server's
bounded metric-name/grouping grammar. An unverified preflight does not imply that
the execution planner will reject every paraphrase. Neither preflight executes
SQL or grants an execution permit (`execution_authorized` is always false).

In enforced mode, `query` rechecks actor access and current meaning before executing
through warehouse policy. Inspect `answerability.status` and `outcome`: blocked,
clarification, unavailable, cancelled and partial outcomes are not complete answers.
Use returned clarification labels to refine the question, or review/publish meaning
in Inbox and retry. A successful result carries a grounding receipt, rows and columns.
The receipt documents that execution; it is not reusable authorization. Off mode
retains the server's existing response, so grounding fields are optional.

MCP equivalents under `loxtep_context` are `query_context`,
`check_context_readiness` and `check_question_answerability`.
