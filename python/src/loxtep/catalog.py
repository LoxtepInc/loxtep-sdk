"""
Catalog (search) API. search.
"""

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class CatalogApi:
    """Sync catalog surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def search(
        self,
        query: str,
        *,
        type: str = "data_product",
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        qs = _query_string({"q": query, "type": type, "limit": limit, "offset": offset})
        return self._http.get(f"/search{qs}")


class AsyncCatalogApi:
    """Async catalog surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def search(
        self,
        query: str,
        *,
        type: str = "data_product",
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        qs = _query_string({"q": query, "type": type, "limit": limit, "offset": offset})
        return await self._http.get(f"/search{qs}")
