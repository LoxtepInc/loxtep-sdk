"""
Customer-facing subset of instance list rows (parity with Node
``instance-list-summary.ts``). Full instance records from ``instances.list``
include stack_id, connection_details, and metadata blobs.
"""

from __future__ import annotations

from typing import Any, Optional


def resolve_instance_type(instance: dict[str, Any]) -> str:
    """Resolve deployment/connect instance type from metadata or connection_details."""
    metadata = instance.get("metadata") if isinstance(instance.get("metadata"), dict) else {}
    connection = (
        instance.get("connection_details")
        if isinstance(instance.get("connection_details"), dict)
        else {}
    )
    raw = metadata.get("instance_type") or connection.get("instance_type") or "shared"
    if raw == "customer":
        return "self-hosted"
    return str(raw)


def resolve_environment_key(instance: dict[str, Any]) -> Optional[str]:
    """Read ``metadata.environment_key``; trim empty → None (never invent prod)."""
    metadata = instance.get("metadata") if isinstance(instance.get("metadata"), dict) else {}
    raw = metadata.get("environment_key")
    if not isinstance(raw, str):
        return None
    trimmed = raw.strip()
    return trimmed if trimmed else None


def to_instance_list_summary(instance: dict[str, Any]) -> dict[str, Any]:
    """Map a full API instance row to the CLI/SDK list summary shape."""
    return {
        "instance_id": instance.get("instance_id"),
        "name": instance.get("name"),
        "api_url": instance.get("api_url"),
        "region": instance.get("region"),
        "status": instance.get("status"),
        "instance_type": resolve_instance_type(instance),
        "environment_key": resolve_environment_key(instance),
    }


def to_instance_list_summaries(instances: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [to_instance_list_summary(i) for i in instances]
