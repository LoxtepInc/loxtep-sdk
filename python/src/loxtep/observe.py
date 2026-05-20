"""
Observe API: status (bots list / observability summary).
Backend: app microservice GET /observe/bots.
"""

from typing import Any

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

OBSERVE_BOTS = "/observe/bots"


def _data(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


class ObserveApi:
    """Sync observe surface: status."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def status(self) -> Any:
        """GET /observe/bots. Returns backend-defined shape (e.g. list of bots)."""
        res = self._http.get(OBSERVE_BOTS)
        return _data(res)


class AsyncObserveApi:
    """Async observe surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def status(self) -> Any:
        """GET /observe/bots."""
        res = await self._http.get(OBSERVE_BOTS)
        return _data(res)
