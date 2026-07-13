"""
Improvements API (AI Eval self-improvement). list, apply, reject.
Internal / experimental — not part of the documented customer surface.
Backend: /ai/improvements.
"""

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

BASE = "/ai/improvements"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class ImprovementsApi:
    """Sync improvements surface (internal)."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        status: Optional[str] = None,
        workflow_name: Optional[str] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {"status": status, "workflow_name": workflow_name, "limit": limit, "cursor": cursor}
        )
        return _unwrap(self._http.get(f"{BASE}{qs}"))

    def apply(self, id: str) -> dict[str, Any]:
        return _unwrap(self._http.post(BASE, {"id": id, "action": "apply"}))

    def reject(self, id: str) -> dict[str, Any]:
        return _unwrap(self._http.post(BASE, {"id": id, "action": "reject"}))


class AsyncImprovementsApi:
    """Async improvements surface (internal)."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        status: Optional[str] = None,
        workflow_name: Optional[str] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {"status": status, "workflow_name": workflow_name, "limit": limit, "cursor": cursor}
        )
        return _unwrap(await self._http.get(f"{BASE}{qs}"))

    async def apply(self, id: str) -> dict[str, Any]:
        return _unwrap(await self._http.post(BASE, {"id": id, "action": "apply"}))

    async def reject(self, id: str) -> dict[str, Any]:
        return _unwrap(await self._http.post(BASE, {"id": id, "action": "reject"}))
