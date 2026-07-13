"""
Standards API (policies). list, get.
Backend: governance microservice /governance/standards.
"""

from typing import Any, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

BASE = "/governance/standards"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class StandardsApi:
    """Sync standards surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        domain_id: Optional[str] = None,
        status: Optional[str] = None,
        type: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {"page": page, "page_size": page_size, "domain_id": domain_id, "status": status, "type": type}
        )
        return _unwrap(self._http.get(f"{BASE}{qs}"))

    def get(self, standard_id: str) -> dict[str, Any]:
        return _unwrap(self._http.get(f"{BASE}/{quote(standard_id)}"))


class AsyncStandardsApi:
    """Async standards surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        domain_id: Optional[str] = None,
        status: Optional[str] = None,
        type: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {"page": page, "page_size": page_size, "domain_id": domain_id, "status": status, "type": type}
        )
        return _unwrap(await self._http.get(f"{BASE}{qs}"))

    async def get(self, standard_id: str) -> dict[str, Any]:
        return _unwrap(await self._http.get(f"{BASE}/{quote(standard_id)}"))
