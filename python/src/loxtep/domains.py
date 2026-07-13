"""
Domains API. list, get.
Backend: organizations microservice /organizations/domains.
"""

from typing import Any, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

BASE = "/organizations/domains"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class DomainsApi:
    """Sync domains surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        organization_id: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {
                "page": page,
                "page_size": page_size,
                "organization_id": organization_id,
                "status": status,
                "search": search,
            }
        )
        return _unwrap(self._http.get(f"{BASE}{qs}"))

    def get(self, domain_id: str) -> dict[str, Any]:
        return _unwrap(self._http.get(f"{BASE}/{quote(domain_id)}"))


class AsyncDomainsApi:
    """Async domains surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        organization_id: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {
                "page": page,
                "page_size": page_size,
                "organization_id": organization_id,
                "status": status,
                "search": search,
            }
        )
        return _unwrap(await self._http.get(f"{BASE}{qs}"))

    async def get(self, domain_id: str) -> dict[str, Any]:
        return _unwrap(await self._http.get(f"{BASE}/{quote(domain_id)}"))
