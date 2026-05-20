"""
Process Intelligence API (LOX-1478, LOX-1627).
decision_traces.list, get_entity_context.
Backend: GET /process-intelligence/organizations/:org_id/decision-traces,
         GET /process-intelligence/organizations/:org_id/context.
"""

from typing import Any, Optional
from urllib.parse import urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

BASE = "/process-intelligence"


def _build_decision_traces_qs(params: dict[str, Any]) -> str:
    clean: dict[str, str] = {}
    for k, v in params.items():
        if v is None:
            continue
        if k == "is_exception" and isinstance(v, bool):
            clean[k] = "true" if v else "false"
        else:
            clean[k] = str(v)
    return "?" + urlencode(clean) if clean else ""


class ProcessIntelligenceApi:
    """Sync process intelligence surface: decision_traces.list, get_entity_context."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def decision_traces_list(
        self,
        organization_id: str,
        *,
        correlation_key: Optional[str] = None,
        correlation_value: Optional[str] = None,
        decision_point: Optional[str] = None,
        is_exception: Optional[bool] = None,
        precedent: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if correlation_key is not None:
            params["correlation_key"] = correlation_key
        if correlation_value is not None:
            params["correlation_value"] = correlation_value
        if decision_point is not None:
            params["decision_point"] = decision_point
        if is_exception is not None:
            params["is_exception"] = is_exception
        if precedent is not None:
            params["precedent"] = precedent
        qs = _build_decision_traces_qs(params)
        path = f"{BASE}/organizations/{organization_id}/decision-traces{qs}"
        res = self._http.get(path)
        return res.get("data", res) if isinstance(res, dict) else res

    def get_entity_context(
        self,
        organization_id: str,
        entity_type: str,
        entity_id: str,
    ) -> Any:
        """Get entity context for process intelligence (entity-specific structure)."""
        qs = urlencode({"entity_type": entity_type, "entity_id": entity_id})
        path = f"{BASE}/organizations/{organization_id}/context?{qs}"
        res = self._http.get(path)
        return res.get("data", res) if isinstance(res, dict) else res


class AsyncProcessIntelligenceApi:
    """Async process intelligence surface: decision_traces.list, get_entity_context."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def decision_traces_list(
        self,
        organization_id: str,
        *,
        correlation_key: Optional[str] = None,
        correlation_value: Optional[str] = None,
        decision_point: Optional[str] = None,
        is_exception: Optional[bool] = None,
        precedent: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if correlation_key is not None:
            params["correlation_key"] = correlation_key
        if correlation_value is not None:
            params["correlation_value"] = correlation_value
        if decision_point is not None:
            params["decision_point"] = decision_point
        if is_exception is not None:
            params["is_exception"] = is_exception
        if precedent is not None:
            params["precedent"] = precedent
        qs = _build_decision_traces_qs(params)
        path = f"{BASE}/organizations/{organization_id}/decision-traces{qs}"
        res = await self._http.get(path)
        return res.get("data", res) if isinstance(res, dict) else res

    async def get_entity_context(
        self,
        organization_id: str,
        entity_type: str,
        entity_id: str,
    ) -> Any:
        """Get entity context for process intelligence (entity-specific structure)."""
        qs = urlencode({"entity_type": entity_type, "entity_id": entity_id})
        path = f"{BASE}/organizations/{organization_id}/context?{qs}"
        res = await self._http.get(path)
        return res.get("data", res) if isinstance(res, dict) else res
