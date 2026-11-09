"""
Product quality rules and suggested quality rules (parity with Node ``client.define.quality_rules``).

Backend: ``/dataproducts/quality-rules`` (CRUD) and
``/dataproducts/dataproducts/{id}/quality/suggestions`` (ask, review, decide).
There is no GET-by-id route for rules; ``get`` lists and finds the id.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional
from urllib.parse import quote, urlencode

from .errors import LoxtepError
from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

_RULES = "/dataproducts/quality-rules"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _list_query(filters: Mapping[str, Any]) -> str:
    params = {k: v for k, v in filters.items() if v not in (None, "")}
    return f"?{urlencode(params)}" if params else ""


def _rule_path(rule_id: str) -> str:
    return f"{_RULES}/{quote(str(rule_id), safe='')}"


def _suggestions_path(data_product_id: str) -> str:
    if not data_product_id:
        raise ValueError("data_product_id is required")
    return f"/dataproducts/dataproducts/{quote(str(data_product_id), safe='')}/quality/suggestions"


def _decision_body(decision: Mapping[str, Any]) -> dict[str, Any]:
    action = decision.get("action")
    if action not in ("accept", "dismiss"):
        raise ValueError("action must be accept or dismiss")
    if decision.get("overrides") and action != "accept":
        raise ValueError("overrides are only allowed with action accept")
    body: dict[str, Any] = {
        "run_id": decision["run_id"],
        "suggestion_key": decision["suggestion_key"],
        "action": action,
    }
    if decision.get("overrides"):
        body["overrides"] = dict(decision["overrides"])
    return body


def _find_rule(listed: Any, rule_id: str) -> Any:
    items = listed if isinstance(listed, list) else []
    if isinstance(listed, dict):
        items = listed.get("items") or listed.get("quality_rules") or []
    for item in items:
        if isinstance(item, dict) and rule_id in (item.get("quality_rule_id"), item.get("id")):
            return item
    raise LoxtepError(
        f"Quality rule {rule_id} was not in the list. GET /quality-rules has no by-id route.",
        code="not_in_list",
    )


class QualityRuleSuggestionsApi:
    """Suggested quality rules (MCP: request/get/decide_quality_rule_suggestion(s))."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def request(self, data_product_id: str) -> Any:
        """Ask for suggestions (async). Returns ``{requested, request_id, reason}``."""
        return _unwrap(self._http.post(_suggestions_path(data_product_id), {}))

    def get(self, data_product_id: str) -> Any:
        """Latest suggestions awaiting review."""
        return _unwrap(self._http.get(_suggestions_path(data_product_id)))

    def decide(self, data_product_id: str, decision: Mapping[str, Any]) -> Any:
        """Accept (creates the rule; optional ``overrides``) or dismiss one suggestion."""
        return _unwrap(
            self._http.post(f"{_suggestions_path(data_product_id)}/decide", _decision_body(decision))
        )


class AsyncQualityRuleSuggestionsApi:
    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def request(self, data_product_id: str) -> Any:
        return _unwrap(await self._http.post(_suggestions_path(data_product_id), {}))

    async def get(self, data_product_id: str) -> Any:
        return _unwrap(await self._http.get(_suggestions_path(data_product_id)))

    async def decide(self, data_product_id: str, decision: Mapping[str, Any]) -> Any:
        return _unwrap(
            await self._http.post(
                f"{_suggestions_path(data_product_id)}/decide", _decision_body(decision)
            )
        )


class QualityRulesApi:
    """Sync quality rules surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http
        self.suggestions = QualityRuleSuggestionsApi(http)

    def list(
        self,
        *,
        data_product_id: Optional[str] = None,
        domain_id: Optional[str] = None,
        rule_type: Optional[str] = None,
        severity: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> Any:
        qs = _list_query(
            {
                "data_product_id": data_product_id,
                "domain_id": domain_id,
                "rule_type": rule_type,
                "severity": severity,
                "page": page,
                "page_size": page_size,
            }
        )
        return _unwrap(self._http.get(f"{_RULES}{qs}"))

    def get(self, rule_id: str, *, data_product_id: Optional[str] = None) -> Any:
        return _find_rule(self.list(data_product_id=data_product_id, page_size=100), rule_id)

    def create(self, input: Mapping[str, Any]) -> Any:
        return _unwrap(self._http.post(_RULES, dict(input)))

    def update(self, rule_id: str, input: Mapping[str, Any]) -> Any:
        return _unwrap(self._http.put(_rule_path(rule_id), dict(input)))

    def delete(self, rule_id: str) -> Any:
        return _unwrap(self._http.delete(_rule_path(rule_id)))


class AsyncQualityRulesApi:
    """Async quality rules surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http
        self.suggestions = AsyncQualityRuleSuggestionsApi(http)

    async def list(
        self,
        *,
        data_product_id: Optional[str] = None,
        domain_id: Optional[str] = None,
        rule_type: Optional[str] = None,
        severity: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> Any:
        qs = _list_query(
            {
                "data_product_id": data_product_id,
                "domain_id": domain_id,
                "rule_type": rule_type,
                "severity": severity,
                "page": page,
                "page_size": page_size,
            }
        )
        return _unwrap(await self._http.get(f"{_RULES}{qs}"))

    async def get(self, rule_id: str, *, data_product_id: Optional[str] = None) -> Any:
        listed = await self.list(data_product_id=data_product_id, page_size=100)
        return _find_rule(listed, rule_id)

    async def create(self, input: Mapping[str, Any]) -> Any:
        return _unwrap(await self._http.post(_RULES, dict(input)))

    async def update(self, rule_id: str, input: Mapping[str, Any]) -> Any:
        return _unwrap(await self._http.put(_rule_path(rule_id), dict(input)))

    async def delete(self, rule_id: str) -> Any:
        return _unwrap(await self._http.delete(_rule_path(rule_id)))
