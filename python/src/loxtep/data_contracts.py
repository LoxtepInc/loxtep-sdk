"""
Data contracts API. list, get, create, update, delete.
Backend: /dataproducts/datacontracts.
"""

from typing import Any, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

BASE = "/dataproducts/datacontracts"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class DataContractsApi:
    """Sync data_contracts surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        data_product_id: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {
                "page": page,
                "page_size": page_size,
                "sort_by": sort_by,
                "sort_order": sort_order,
                "data_product_id": data_product_id,
                "status": status,
                "search": search,
            }
        )
        return _unwrap(self._http.get(f"{BASE}{qs}"))

    def get(self, contract_id: str) -> dict[str, Any]:
        return _unwrap(self._http.get(f"{BASE}/{quote(contract_id)}"))

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        return _unwrap(self._http.post(BASE, payload))

    def update(self, contract_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return _unwrap(self._http.put(f"{BASE}/{quote(contract_id)}", payload))

    def delete(self, contract_id: str) -> None:
        self._http.delete(f"{BASE}/{quote(contract_id)}")


class AsyncDataContractsApi:
    """Async data_contracts surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        data_product_id: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {
                "page": page,
                "page_size": page_size,
                "sort_by": sort_by,
                "sort_order": sort_order,
                "data_product_id": data_product_id,
                "status": status,
                "search": search,
            }
        )
        return _unwrap(await self._http.get(f"{BASE}{qs}"))

    async def get(self, contract_id: str) -> dict[str, Any]:
        return _unwrap(await self._http.get(f"{BASE}/{quote(contract_id)}"))

    async def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        return _unwrap(await self._http.post(BASE, payload))

    async def update(self, contract_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return _unwrap(await self._http.put(f"{BASE}/{quote(contract_id)}", payload))

    async def delete(self, contract_id: str) -> None:
        await self._http.delete(f"{BASE}/{quote(contract_id)}")
