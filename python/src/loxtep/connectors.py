"""
Connectors API. list, get, create, update, delete, test, capture_samples, get_oauth_url.
Backend: connectors microservice /connectors/connectors.
"""

from typing import Any, Optional
from urllib.parse import urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

CONNECTORS_BASE = "/connectors/connectors"


def _query_string(params: dict[str, Any]) -> str:
    clean = {k: str(v) for k, v in params.items() if v is not None}
    return "?" + urlencode(clean) if clean else ""


class ConnectorsApi:
    """Sync connectors surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        organization_id: Optional[str] = None,
        connector_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "page": page,
            "page_size": page_size,
            "sort_by": sort_by,
            "sort_order": sort_order,
        }
        if organization_id is not None:
            params["organization_id"] = organization_id
        if connector_type is not None:
            params["connector_type"] = connector_type
        qs = _query_string(params)
        res = self._http.get(f"{CONNECTORS_BASE}{qs}")
        return res if isinstance(res, dict) else {"items": [], "pagination": {}}

    def get(self, connector_id: str) -> dict[str, Any]:
        res = self._http.get(f"{CONNECTORS_BASE}/{connector_id}")
        return res.get("data", res) if isinstance(res, dict) else res

    def create(
        self,
        connector_type: str,
        *,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"connector_type": connector_type}
        if metadata is not None:
            body["metadata"] = metadata
        res = self._http.post(CONNECTORS_BASE, body)
        return res.get("data", res) if isinstance(res, dict) else res

    def update(
        self,
        connector_id: str,
        *,
        connector_type: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if connector_type is not None:
            body["connector_type"] = connector_type
        if metadata is not None:
            body["metadata"] = metadata
        res = self._http.put(f"{CONNECTORS_BASE}/{connector_id}", body)
        return res.get("data", res) if isinstance(res, dict) else res

    def delete(self, connector_id: str) -> None:
        self._http.delete(f"{CONNECTORS_BASE}/{connector_id}")

    def test(self, connector_id: str) -> dict[str, Any]:
        res = self._http.post(f"{CONNECTORS_BASE}/{connector_id}/test", {})
        return res.get("data", res) if isinstance(res, dict) else res

    def capture_samples(
        self,
        connector_id: str,
        *,
        entity_type: str,
        limit: Optional[int] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"entity_type": entity_type}
        if limit is not None:
            body["limit"] = limit
        res = self._http.post(f"{CONNECTORS_BASE}/{connector_id}/capture-samples", body)
        return res.get("data", res) if isinstance(res, dict) else res

    def get_oauth_url(
        self,
        connector_id: str,
        *,
        callback_url: Optional[str] = None,
        toolkit: Optional[str] = None,
    ) -> dict[str, str]:
        params: dict[str, str] = {}
        if callback_url is not None:
            params["callback_url"] = callback_url
        if toolkit is not None:
            params["toolkit"] = toolkit
        qs = "?" + urlencode(params) if params else ""
        res = self._http.get(f"{CONNECTORS_BASE}/{connector_id}/oauth{qs}")
        r = res if isinstance(res, dict) else {}
        redirect = r.get("redirect_url", "")
        return {"oauth_url": redirect}


class AsyncConnectorsApi:
    """Async connectors surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        organization_id: Optional[str] = None,
        connector_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "page": page,
            "page_size": page_size,
            "sort_by": sort_by,
            "sort_order": sort_order,
        }
        if organization_id is not None:
            params["organization_id"] = organization_id
        if connector_type is not None:
            params["connector_type"] = connector_type
        qs = _query_string(params)
        res = await self._http.get(f"{CONNECTORS_BASE}{qs}")
        return res if isinstance(res, dict) else {"items": [], "pagination": {}}

    async def get(self, connector_id: str) -> dict[str, Any]:
        res = await self._http.get(f"{CONNECTORS_BASE}/{connector_id}")
        return res.get("data", res) if isinstance(res, dict) else res

    async def create(
        self,
        connector_type: str,
        *,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"connector_type": connector_type}
        if metadata is not None:
            body["metadata"] = metadata
        res = await self._http.post(CONNECTORS_BASE, body)
        return res.get("data", res) if isinstance(res, dict) else res

    async def update(
        self,
        connector_id: str,
        *,
        connector_type: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if connector_type is not None:
            body["connector_type"] = connector_type
        if metadata is not None:
            body["metadata"] = metadata
        res = await self._http.put(f"{CONNECTORS_BASE}/{connector_id}", body)
        return res.get("data", res) if isinstance(res, dict) else res

    async def delete(self, connector_id: str) -> None:
        await self._http.delete(f"{CONNECTORS_BASE}/{connector_id}")

    async def test(self, connector_id: str) -> dict[str, Any]:
        res = await self._http.post(f"{CONNECTORS_BASE}/{connector_id}/test", {})
        return res.get("data", res) if isinstance(res, dict) else res

    async def capture_samples(
        self,
        connector_id: str,
        *,
        entity_type: str,
        limit: Optional[int] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"entity_type": entity_type}
        if limit is not None:
            body["limit"] = limit
        res = await self._http.post(f"{CONNECTORS_BASE}/{connector_id}/capture-samples", body)
        return res.get("data", res) if isinstance(res, dict) else res

    async def get_oauth_url(
        self,
        connector_id: str,
        *,
        callback_url: Optional[str] = None,
        toolkit: Optional[str] = None,
    ) -> dict[str, str]:
        params: dict[str, str] = {}
        if callback_url is not None:
            params["callback_url"] = callback_url
        if toolkit is not None:
            params["toolkit"] = toolkit
        qs = "?" + urlencode(params) if params else ""
        res = await self._http.get(f"{CONNECTORS_BASE}/{connector_id}/oauth{qs}")
        r = res if isinstance(res, dict) else {}
        redirect = r.get("redirect_url", "")
        return {"oauth_url": redirect}
