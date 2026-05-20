"""
Connections API. list, get, create, update, test.
"""

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

CONNECTIONS_BASE = "/workflows/connections"


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class ConnectionsApi:
    """Sync connections surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def get(self, id: str) -> dict[str, Any]:
        res = self._http.get(f"{CONNECTIONS_BASE}/{id}")
        return res.get("data", res) if isinstance(res, dict) else res

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if search is not None:
            params["search"] = search
        if type is not None:
            params["type"] = type
        if status is not None:
            params["status"] = status
        qs = _query_string(params)
        res = self._http.get(f"{CONNECTIONS_BASE}{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    def create(
        self,
        name: str,
        type: str,
        key: str,
        *,
        data: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name, "type": type, "key": key}
        if data is not None:
            body["data"] = data
        if configuration is not None:
            body["configuration"] = configuration
        if metadata is not None:
            body["metadata"] = metadata
        res = self._http.post(CONNECTIONS_BASE, body)
        return res.get("data", res) if isinstance(res, dict) else res

    def update(
        self,
        id: str,
        *,
        name: Optional[str] = None,
        data: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if data is not None:
            body["data"] = data
        if configuration is not None:
            body["configuration"] = configuration
        if metadata is not None:
            body["metadata"] = metadata
        res = self._http.put(f"{CONNECTIONS_BASE}/{id}", body)
        return res.get("data", res) if isinstance(res, dict) else res

    def delete(self, id: str) -> None:
        self._http.delete(f"{CONNECTIONS_BASE}/{id}")

    def test(self, id: str) -> dict[str, Any]:
        res = self._http.post(f"{CONNECTIONS_BASE}/{id}/test", {})
        return res.get("data", res) if isinstance(res, dict) else res


class AsyncConnectionsApi:
    """Async connections surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def get(self, id: str) -> dict[str, Any]:
        res = await self._http.get(f"{CONNECTIONS_BASE}/{id}")
        return res.get("data", res) if isinstance(res, dict) else res

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if search is not None:
            params["search"] = search
        if type is not None:
            params["type"] = type
        if status is not None:
            params["status"] = status
        qs = _query_string(params)
        res = await self._http.get(f"{CONNECTIONS_BASE}{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    async def create(
        self,
        name: str,
        type: str,
        key: str,
        *,
        data: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name, "type": type, "key": key}
        if data is not None:
            body["data"] = data
        if configuration is not None:
            body["configuration"] = configuration
        if metadata is not None:
            body["metadata"] = metadata
        res = await self._http.post(CONNECTIONS_BASE, body)
        return res.get("data", res) if isinstance(res, dict) else res

    async def update(
        self,
        id: str,
        *,
        name: Optional[str] = None,
        data: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if data is not None:
            body["data"] = data
        if configuration is not None:
            body["configuration"] = configuration
        if metadata is not None:
            body["metadata"] = metadata
        res = await self._http.put(f"{CONNECTIONS_BASE}/{id}", body)
        return res.get("data", res) if isinstance(res, dict) else res

    async def delete(self, id: str) -> None:
        await self._http.delete(f"{CONNECTIONS_BASE}/{id}")

    async def test(self, id: str) -> dict[str, Any]:
        res = await self._http.post(f"{CONNECTIONS_BASE}/{id}/test", {})
        return res.get("data", res) if isinstance(res, dict) else res
