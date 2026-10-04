"""
Semantic package lifecycle API.
MCP: save/plan/approve/deploy/verify/get_status/import_external_semantic_package
  → client.meaning.packages.*

  POST /semantic-layer/packages
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

PACKAGES_PATH = "/semantic-layer/packages"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


class PackagesApi:
    """Sync semantic packages surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def _post(self, body: Mapping[str, Any]) -> dict[str, Any]:
        return _unwrap(self._http.post(PACKAGES_PATH, dict(body)))

    def save(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return self._post({"action": "save", **dict(input)})

    def plan(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return self._post({"action": "plan", **dict(input)})

    def approve(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return self._post({"action": "approve", **dict(input)})

    def deploy(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return self._post({"action": "deploy", **dict(input)})

    def verify(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return self._post({"action": "verify", **dict(input)})

    def status(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return self._post({"action": "status", **dict(input)})

    def import_external(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return self._post({"action": "import_external", **dict(input)})


class AsyncPackagesApi:
    """Async semantic packages surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def _post(self, body: Mapping[str, Any]) -> dict[str, Any]:
        return _unwrap(await self._http.post(PACKAGES_PATH, dict(body)))

    async def save(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return await self._post({"action": "save", **dict(input)})

    async def plan(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return await self._post({"action": "plan", **dict(input)})

    async def approve(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return await self._post({"action": "approve", **dict(input)})

    async def deploy(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return await self._post({"action": "deploy", **dict(input)})

    async def verify(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return await self._post({"action": "verify", **dict(input)})

    async def status(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return await self._post({"action": "status", **dict(input)})

    async def import_external(self, input: Mapping[str, Any]) -> dict[str, Any]:
        return await self._post({"action": "import_external", **dict(input)})
