"""
Instances API. list, get, get_stream_config, create, update, redeploy_runtimes.
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

    def create(self, input: dict[str, Any]) -> dict[str, Any]:
        """POST /organizations/instances. Flat MCP-style input is wrapped as instance_config."""
        payment_method_id = input.get("payment_method_id")
        instance_config = {k: v for k, v in input.items() if k != "payment_method_id"}
        body: dict[str, Any] = {"instance_config": instance_config}
        if payment_method_id:
            body["payment_method_id"] = payment_method_id
        res = self._http.post(INSTANCES_BASE, body)
        return res.get("data", res) if isinstance(res, dict) else res

    def update(self, instance_id: str, input: dict[str, Any]) -> dict[str, Any]:
        """PUT /organizations/instances/{id}. Pass connector_vpc and/or force_runtimes_redeploy."""
        res = self._http.put(f"{INSTANCES_BASE}/{instance_id}", input)
        data = res.get("data", res) if isinstance(res, dict) else res
        return data.get("instance", data) if isinstance(data, dict) else data

    def redeploy_runtimes(self, instance_id: str) -> dict[str, Any]:
        """Reapply the per-instance runtimes stack without changing VPC."""
        return self.update(instance_id, {"force_runtimes_redeploy": True})


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

    async def create(self, input: dict[str, Any]) -> dict[str, Any]:
        payment_method_id = input.get("payment_method_id")
        instance_config = {k: v for k, v in input.items() if k != "payment_method_id"}
        body: dict[str, Any] = {"instance_config": instance_config}
        if payment_method_id:
            body["payment_method_id"] = payment_method_id
        res = await self._http.post(INSTANCES_BASE, body)
        return res.get("data", res) if isinstance(res, dict) else res

    async def update(self, instance_id: str, input: dict[str, Any]) -> dict[str, Any]:
        res = await self._http.put(f"{INSTANCES_BASE}/{instance_id}", input)
        data = res.get("data", res) if isinstance(res, dict) else res
        return data.get("instance", data) if isinstance(data, dict) else data

    async def redeploy_runtimes(self, instance_id: str) -> dict[str, Any]:
        return await self.update(instance_id, {"force_runtimes_redeploy": True})
