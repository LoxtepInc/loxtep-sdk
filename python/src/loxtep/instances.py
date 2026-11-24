"""
Instances API. list, get, get_stream_config, create, update, redeploy_runtimes.
Backend: organizations microservice /organizations/instances.
"""

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

INSTANCES_BASE = "/organizations/instances"

_MISSING = object()


def normalize_writable_environment_key(raw: Any) -> Optional[str]:
    """Trim+lowercase open segregation key for write; empty/None clears.

    Not a closed stage/prod/dev enum — franchise/location slugs are allowed.
    Aliases: staging→stage, production→prod.
    """
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise TypeError("environment_key must be a string or None")
    trimmed = raw.strip().lower()
    if not trimmed:
        return None
    if trimmed == "staging":
        return "stage"
    if trimmed == "production":
        return "prod"
    return trimmed


def build_instance_update_body(input: dict[str, Any]) -> dict[str, Any]:
    """Map first-class ``environment_key`` into ``metadata.environment_key``."""
    body = dict(input)
    env = body.pop("environment_key", _MISSING)
    metadata = body.get("metadata")
    if metadata is not None and not isinstance(metadata, dict):
        raise TypeError("metadata must be a dict")
    next_meta: dict[str, Any] | None = dict(metadata) if isinstance(metadata, dict) else None

    if env is not _MISSING:
        next_meta = {} if next_meta is None else next_meta
        next_meta["environment_key"] = normalize_writable_environment_key(env)
    elif next_meta is not None and "environment_key" in next_meta:
        next_meta["environment_key"] = normalize_writable_environment_key(
            next_meta.get("environment_key")
        )

    if next_meta is not None:
        body["metadata"] = next_meta
    return body


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
        """PUT /organizations/instances/{id}.

        Accepts ``environment_key`` (or ``metadata.environment_key``) as an open
        slug written to metadata; empty/None clears. Also connector_vpc and
        force_runtimes_redeploy.
        """
        res = self._http.put(f"{INSTANCES_BASE}/{instance_id}", build_instance_update_body(input))
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
        """PUT /organizations/instances/{id}. See ``InstancesApi.update``."""
        res = await self._http.put(
            f"{INSTANCES_BASE}/{instance_id}", build_instance_update_body(input)
        )
        data = res.get("data", res) if isinstance(res, dict) else res
        return data.get("instance", data) if isinstance(data, dict) else data

    async def redeploy_runtimes(self, instance_id: str) -> dict[str, Any]:
        return await self.update(instance_id, {"force_runtimes_redeploy": True})
