"""
Schemas API (data product schema). get.
"""

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


class SchemasApi:
    """Sync schemas surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def get(self, data_product_id: str, *, version: Optional[str] = None) -> dict[str, Any]:
        path = f"/dataproducts/{data_product_id}/schema"
        if version is not None:
            path += f"?version={version}"
        res = self._http.get(path)
        return res.get("data", res) if isinstance(res, dict) else res


class AsyncSchemasApi:
    """Async schemas surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def get(self, data_product_id: str, *, version: Optional[str] = None) -> dict[str, Any]:
        path = f"/dataproducts/{data_product_id}/schema"
        if version is not None:
            path += f"?version={version}"
        res = await self._http.get(path)
        return res.get("data", res) if isinstance(res, dict) else res
