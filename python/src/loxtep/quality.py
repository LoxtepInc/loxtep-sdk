"""
Quality API. list, get.
"""

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


class QualityApi:
    """Sync quality surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        data_product_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if data_product_id is not None:
            params["data_product_id"] = data_product_id
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        res = self._http.get(f"/quality/metrics?{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    def get(self, id: str) -> dict[str, Any]:
        res = self._http.get(f"/quality/metrics/{id}")
        return res.get("data", res) if isinstance(res, dict) else res


class AsyncQualityApi:
    """Async quality surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        data_product_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if data_product_id is not None:
            params["data_product_id"] = data_product_id
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        res = await self._http.get(f"/quality/metrics?{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    async def get(self, id: str) -> dict[str, Any]:
        res = await self._http.get(f"/quality/metrics/{id}")
        return res.get("data", res) if isinstance(res, dict) else res
