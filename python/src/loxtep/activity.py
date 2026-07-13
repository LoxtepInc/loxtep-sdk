"""
Activity API (activity / audit entries). list.
Internal / experimental — not part of the documented customer surface.
Backend: /ai/activity.
"""

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

BASE = "/ai/activity"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class ActivityApi:
    """Sync activity surface (internal)."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        source: Optional[str] = None,
        actor: Optional[str] = None,
        resource_type: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {
                "source": source,
                "actor": actor,
                "resource_type": resource_type,
                "start": start,
                "end": end,
                "limit": limit,
                "cursor": cursor,
            }
        )
        return _unwrap(self._http.get(f"{BASE}{qs}"))


class AsyncActivityApi:
    """Async activity surface (internal)."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        source: Optional[str] = None,
        actor: Optional[str] = None,
        resource_type: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {
                "source": source,
                "actor": actor,
                "resource_type": resource_type,
                "start": start,
                "end": end,
                "limit": limit,
                "cursor": cursor,
            }
        )
        return _unwrap(await self._http.get(f"{BASE}{qs}"))
