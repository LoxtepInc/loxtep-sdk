import asyncio
from loxtep.semantic_grounding import SemanticGroundingApi, AsyncSemanticGroundingApi


def test_sync_preflight_never_executes():
    calls = []
    class Http:
        def post(self, path, body):
            calls.append((path, body))
            return {"data": {"execution_authorized": False}}
    api = SemanticGroundingApi(Http())
    assert api.check_readiness(data_product_ids=["product"])["execution_authorized"] is False
    assert calls == [("/ai/context/readiness", {"data_product_ids": ["product"], "metric_names": [], "relationship_roles": []})]


def test_async_preserves_grounded_result():
    calls = []
    result = {"outcome": "blocked", "answerability": {"status": "blocked"}}
    class Http:
        async def post(self, path, body):
            calls.append((path, body))
            return {"data": result}
    api = AsyncSemanticGroundingApi(Http())
    assert asyncio.run(api.query(question="Revenue", data_product_ids=["product"])) == result
    assert calls == [("/ai/context/query", {"question": "Revenue", "data_product_ids": ["product"]})]
