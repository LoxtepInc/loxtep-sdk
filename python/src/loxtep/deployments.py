"""
Deployments API — list/get deployment records for async poll after deploy.
MCP: loxtep_observe → list_deployments / get_deployment.

  GET /workflows/deployments
  GET /workflows/deployments/{deployment_id}
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from urllib.parse import urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

DEPLOYMENTS_BASE = "/workflows/deployments"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _query_string(params: dict[str, Any]) -> str:
    clean = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in params.items() if v is not None}
    return "?" + urlencode(clean) if clean else ""


def pick_latest_deployment(items: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Pick the best "latest" deployment for status (prefer status=deployed)."""
    if not items:
        return None
    deployed = [d for d in items if d.get("status") == "deployed"]
    pool = deployed if deployed else items

    def _ts(row: dict[str, Any]) -> float:
        raw = row.get("updated_at") or row.get("created_at") or ""
        if not raw:
            return 0.0
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0

    return max(pool, key=_ts)


class DeploymentsApi:
    """Sync deployments surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        instance_id: Optional[str] = None,
        status: Optional[str] = None,
        type: Optional[str] = None,
        orphaned: Optional[bool] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {
                "project_id": project_id,
                "workflow_id": workflow_id,
                "instance_id": instance_id,
                "status": status,
                "type": type,
                "orphaned": orphaned,
                "page": page,
                "page_size": page_size,
                "sort_by": sort_by,
                "sort_order": sort_order,
            }
        )
        payload = _unwrap(self._http.get(f"{DEPLOYMENTS_BASE}{qs}"))
        if not isinstance(payload, dict):
            return {"items": [], "pagination": None}
        return {
            "items": payload.get("items") or [],
            "pagination": payload.get("pagination"),
        }

    def get(
        self,
        deployment_id: str,
        *,
        include_versions: bool = False,
    ) -> dict[str, Any]:
        qs = _query_string({"include_versions": True} if include_versions else {})
        return _unwrap(self._http.get(f"{DEPLOYMENTS_BASE}/{deployment_id}{qs}"))


class AsyncDeploymentsApi:
    """Async deployments surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        instance_id: Optional[str] = None,
        status: Optional[str] = None,
        type: Optional[str] = None,
        orphaned: Optional[bool] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> dict[str, Any]:
        qs = _query_string(
            {
                "project_id": project_id,
                "workflow_id": workflow_id,
                "instance_id": instance_id,
                "status": status,
                "type": type,
                "orphaned": orphaned,
                "page": page,
                "page_size": page_size,
                "sort_by": sort_by,
                "sort_order": sort_order,
            }
        )
        payload = _unwrap(await self._http.get(f"{DEPLOYMENTS_BASE}{qs}"))
        if not isinstance(payload, dict):
            return {"items": [], "pagination": None}
        return {
            "items": payload.get("items") or [],
            "pagination": payload.get("pagination"),
        }

    async def get(
        self,
        deployment_id: str,
        *,
        include_versions: bool = False,
    ) -> dict[str, Any]:
        qs = _query_string({"include_versions": True} if include_versions else {})
        return _unwrap(await self._http.get(f"{DEPLOYMENTS_BASE}/{deployment_id}{qs}"))
