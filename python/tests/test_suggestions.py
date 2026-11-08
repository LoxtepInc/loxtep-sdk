"""Quality rule + consumption method suggestions (parity with Node SDK)."""

from unittest.mock import AsyncMock, patch

import pytest

from loxtep import AsyncLoxtepClient, LoxtepClient
from loxtep.errors import LoxtepError

DP = "dp-1"
QBASE = f"/dataproducts/dataproducts/{DP}/quality/suggestions"
CBASE = f"/dataproducts/dataproducts/{DP}/delivery/suggestions"


def _client() -> LoxtepClient:
    return LoxtepClient(api_url="https://api.example.com", organization_id="org1")


def test_quality_rule_suggestions_request_get_decide():
    client = _client()
    with patch.object(client._http, "post") as post, patch.object(client._http, "get") as get:
        post.return_value = {"success": True, "data": {"requested": True}}
        get.return_value = {"success": True, "data": {"run_id": "run-1", "suggestions": []}}
        api = client.define.quality_rules.suggestions
        assert api.request(DP) == {"requested": True}
        post.assert_called_with(QBASE, {})
        assert api.get(DP)["run_id"] == "run-1"
        get.assert_called_with(QBASE)
        api.decide(
            DP,
            {
                "run_id": "run-1",
                "suggestion_key": "email_completeness",
                "action": "accept",
                "overrides": {"threshold": 99},
            },
        )
        post.assert_called_with(
            f"{QBASE}/decide",
            {
                "run_id": "run-1",
                "suggestion_key": "email_completeness",
                "action": "accept",
                "overrides": {"threshold": 99},
            },
        )
    client.close()


def test_quality_rule_suggestion_decide_validates():
    client = _client()
    api = client.define.quality_rules.suggestions
    with pytest.raises(ValueError, match="only allowed with action accept"):
        api.decide(
            DP, {"run_id": "r", "suggestion_key": "k", "action": "dismiss", "overrides": {"a": 1}}
        )
    with pytest.raises(ValueError, match="accept or dismiss"):
        api.decide(DP, {"run_id": "r", "suggestion_key": "k", "action": "maybe"})
    with pytest.raises(ValueError, match="data_product_id is required"):
        api.get("")
    client.close()


def test_quality_rules_crud_paths():
    client = _client()
    rules = client.define.quality_rules
    with patch.object(client._http, "get") as get, patch.object(
        client._http, "post"
    ) as post, patch.object(client._http, "put") as put, patch.object(
        client._http, "delete"
    ) as delete:
        get.return_value = {"data": {"quality_rules": [{"quality_rule_id": "rule-1"}]}}
        post.return_value = {"data": {"quality_rule_id": "rule-2"}}
        put.return_value = {"data": {"quality_rule_id": "rule-2"}}
        delete.return_value = {"data": {"deleted": True}}
        assert rules.get("rule-1", data_product_id=DP) == {"quality_rule_id": "rule-1"}
        get.assert_called_with(f"/dataproducts/quality-rules?data_product_id={DP}&page_size=100")
        with pytest.raises(LoxtepError) as exc:
            rules.get("missing")
        assert exc.value.code == "not_in_list"
        rules.create({"data_product_id": DP, "name": "n"})
        post.assert_called_with("/dataproducts/quality-rules", {"data_product_id": DP, "name": "n"})
        rules.update("rule-2", {"threshold": 90})
        put.assert_called_with("/dataproducts/quality-rules/rule-2", {"threshold": 90})
        rules.delete("rule-2")
        delete.assert_called_with("/dataproducts/quality-rules/rule-2")
    client.close()


def test_consumption_suggestions_request_get_decide():
    client = _client()
    with patch.object(client._http, "post") as post, patch.object(client._http, "get") as get:
        post.return_value = {"data": {"requested": True}}
        get.return_value = {"data": {"published_access_methods": ["event_stream"]}}
        api = client.build.data_products.consumption_suggestions
        api.request(DP)
        post.assert_called_with(CBASE, {})
        assert api.get(DP)["published_access_methods"] == ["event_stream"]
        api.decide(DP, {"run_id": "run-1", "suggestion_key": "sql", "action": "accept"})
        post.assert_called_with(
            f"{CBASE}/decide", {"run_id": "run-1", "suggestion_key": "sql", "action": "accept"}
        )
        with pytest.raises(ValueError, match="suggestion_key must be one of"):
            api.decide(DP, {"run_id": "r", "suggestion_key": "event_stream", "action": "accept"})
    client.close()


@pytest.mark.asyncio
async def test_async_suggestion_surfaces():
    client = AsyncLoxtepClient(api_url="https://api.example.com", organization_id="org1")
    with patch.object(client._http, "post", new=AsyncMock(return_value={"data": {"ok": 1}})) as post:
        await client.define.quality_rules.suggestions.request(DP)
        post.assert_awaited_with(QBASE, {})
        await client.build.data_products.consumption_suggestions.decide(
            DP, {"run_id": "r", "suggestion_key": "webhook", "action": "dismiss"}
        )
        post.assert_awaited_with(
            f"{CBASE}/decide", {"run_id": "r", "suggestion_key": "webhook", "action": "dismiss"}
        )
    await client.aclose()
