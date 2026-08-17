"""
Instances API. list, get, get_stream_config.
Backend: organizations microservice /organizations/instances.
"""

from typing import Any

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

INSTANCES_BASE = "/organizations/instances"


class InstancesApi:
    """Sync instances surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(self) -> dict[str, Any]:
        res = self._http.get(INSTANCES_BASE)
        data = res.get("data", res) if isinstance(res, dict) else {}
        return {
            "items": data.get("items", []) if isinstance(data, dict) else [],
            "pagination": data.get("pagination", {}) if isinstance(data, dict) else {},
        }

    def get(self, instance_id: str) -> dict[str, Any]:
        res = self._http.get(f"{INSTANCES_BASE}/{instance_id}")
        data = res.get("data", res) if isinstance(res, dict) else {}
        return data.get("instance", data) if isinstance(data, dict) else data

    def get_stream_config(self, instance_id: str) -> dict[str, Any]:
        """GET /organizations/instances/{id}/stream-config."""
        res = self._http.get(f"{INSTANCES_BASE}/{instance_id}/stream-config")
        return res.get("data", res) if isinstance(res, dict) else res


class AsyncInstancesApi:
    """Async instances surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(self) -> dict[str, Any]:
        res = await self._http.get(INSTANCES_BASE)
        data = res.get("data", res) if isinstance(res, dict) else {}
        return {
            "items": data.get("items", []) if isinstance(data, dict) else [],
            "pagination": data.get("pagination", {}) if isinstance(data, dict) else {},
        }

    async def get(self, instance_id: str) -> dict[str, Any]:
        res = await self._http.get(f"{INSTANCES_BASE}/{instance_id}")
        data = res.get("data", res) if isinstance(res, dict) else {}
        return data.get("instance", data) if isinstance(data, dict) else data

    async def get_stream_config(self, instance_id: str) -> dict[str, Any]:
        res = await self._http.get(f"{INSTANCES_BASE}/{instance_id}/stream-config")
        return res.get("data", res) if isinstance(res, dict) else res
