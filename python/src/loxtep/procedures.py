"""
Procedures API. list.
Backend: process-intelligence /process-intelligence/organizations/:org_id/procedures.
"""

from typing import Any
from urllib.parse import urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

BASE = "/process-intelligence"


def _query_string(params: dict[str, Any]) -> str:
    clean = {k: str(v) for k, v in params.items() if v is not None}
    return "?" + urlencode(clean) if clean else ""


class ProceduresApi:
    """Sync procedures surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        organization_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        params = {"page": page, "page_size": page_size}
        qs = _query_string(params)
        path = f"{BASE}/organizations/{organization_id}/procedures{qs}"
        res = self._http.get(path)
        data = res.get("data", res) if isinstance(res, dict) else {}
        return {
            "items": data.get("items", []) if isinstance(data, dict) else [],
            "pagination": data.get("pagination", {}) if isinstance(data, dict) else {},
        }


class AsyncProceduresApi:
    """Async procedures surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        organization_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        params = {"page": page, "page_size": page_size}
        qs = _query_string(params)
        path = f"{BASE}/organizations/{organization_id}/procedures{qs}"
        res = await self._http.get(path)
        data = res.get("data", res) if isinstance(res, dict) else {}
        return {
            "items": data.get("items", []) if isinstance(data, dict) else [],
            "pagination": data.get("pagination", {}) if isinstance(data, dict) else {},
        }
