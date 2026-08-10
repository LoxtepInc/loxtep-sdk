"""
Process Intelligence API (LOX-1478, LOX-1627, LOX-1226).
decision_traces.list / create / get_chain / get_similar, get_entity_context.

Backend:
  GET  /process-intelligence/organizations/:org_id/decision-traces
  POST /process-intelligence/organizations/:org_id/decision-traces
  GET  /process-intelligence/organizations/:org_id/decision-traces/:trace_id/chain
  GET  /process-intelligence/organizations/:org_id/decision-traces/:trace_id/similar
  GET  /process-intelligence/organizations/:org_id/context

Thin HTTP wrap only — platform owns graph walk / ranking logic.
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


def _traces_base(organization_id: str) -> str:
    return f"{BASE}/organizations/{organization_id}/decision-traces"


def _unwrap_data(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


class ProcessIntelligenceApi:
    """Sync process intelligence surface including LOX-1226 chain/similar/create."""

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
        path = f"{_traces_base(organization_id)}{qs}"
        return _unwrap_data(self._http.get(path))

    def decision_traces_create(
        self,
        organization_id: str,
        body: dict[str, Any],
    ) -> Any:
        """POST entity-level decision trace (supports links / precedent_id from LOX-1226)."""
        return _unwrap_data(self._http.post(_traces_base(organization_id), body))

    def decision_traces_get_chain(
        self,
        organization_id: str,
        trace_id: str,
        *,
        max_depth: Optional[int] = None,
        direction: Optional[str] = None,
    ) -> Any:
        """GET causal chain for a decision trace (LOX-1226)."""
        params: dict[str, Any] = {}
        if max_depth is not None:
            params["max_depth"] = max_depth
        if direction is not None:
            params["direction"] = direction
        qs = _build_decision_traces_qs(params)
        path = f"{_traces_base(organization_id)}/{trace_id}/chain{qs}"
        return _unwrap_data(self._http.get(path))

    def decision_traces_get_similar(
        self,
        organization_id: str,
        trace_id: str,
        *,
        limit: Optional[int] = None,
    ) -> Any:
        """GET similar / precedent-ranked decisions (LOX-1226)."""
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        qs = _build_decision_traces_qs(params)
        path = f"{_traces_base(organization_id)}/{trace_id}/similar{qs}"
        return _unwrap_data(self._http.get(path))

    def get_entity_context(
        self,
        organization_id: str,
        entity_type: str,
        entity_id: str,
    ) -> Any:
        """Get entity context for process intelligence (entity-specific structure)."""
        qs = urlencode({"entity_type": entity_type, "entity_id": entity_id})
        path = f"{BASE}/organizations/{organization_id}/context?{qs}"
        return _unwrap_data(self._http.get(path))


class AsyncProcessIntelligenceApi:
    """Async process intelligence surface including LOX-1226 chain/similar/create."""

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
        path = f"{_traces_base(organization_id)}{qs}"
        return _unwrap_data(await self._http.get(path))

    async def decision_traces_create(
        self,
        organization_id: str,
        body: dict[str, Any],
    ) -> Any:
        """POST entity-level decision trace (supports links / precedent_id from LOX-1226)."""
        return _unwrap_data(await self._http.post(_traces_base(organization_id), body))

    async def decision_traces_get_chain(
        self,
        organization_id: str,
        trace_id: str,
        *,
        max_depth: Optional[int] = None,
        direction: Optional[str] = None,
    ) -> Any:
        """GET causal chain for a decision trace (LOX-1226)."""
        params: dict[str, Any] = {}
        if max_depth is not None:
            params["max_depth"] = max_depth
        if direction is not None:
            params["direction"] = direction
        qs = _build_decision_traces_qs(params)
        path = f"{_traces_base(organization_id)}/{trace_id}/chain{qs}"
        return _unwrap_data(await self._http.get(path))

    async def decision_traces_get_similar(
        self,
        organization_id: str,
        trace_id: str,
        *,
        limit: Optional[int] = None,
    ) -> Any:
        """GET similar / precedent-ranked decisions (LOX-1226)."""
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        qs = _build_decision_traces_qs(params)
        path = f"{_traces_base(organization_id)}/{trace_id}/similar{qs}"
        return _unwrap_data(await self._http.get(path))

    async def get_entity_context(
        self,
        organization_id: str,
        entity_type: str,
        entity_id: str,
    ) -> Any:
        """Get entity context for process intelligence (entity-specific structure)."""
        qs = urlencode({"entity_type": entity_type, "entity_id": entity_id})
        path = f"{BASE}/organizations/{organization_id}/context?{qs}"
        return _unwrap_data(await self._http.get(path))
