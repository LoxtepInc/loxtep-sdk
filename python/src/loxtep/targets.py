"""
Targets API — delivery-side connector bindings (workflow connection nodes at the
tail of a delivery workflow). Parallel to triggers (ingest-head connections).

Backend: project entities (`/workflows/projects/{project_id}/entities/.../connections`).
Prefer `save_workflow_bundle` / `loxtep delivery create` for new delivery flows.

Does NOT call `/dataproducts/:id/consumptions` (that architecture was removed).
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Union

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient
from .models import Target


def _require_project_id(project_id: Optional[str], action: str) -> str:
    if not project_id:
        raise ValueError(
            f"targets.{action} requires project_id. Pass project_id / config.project_id, "
            "or use save_workflow_bundle."
        )
    return project_id


def _entities_base(project_id: str) -> str:
    return f"/workflows/projects/{project_id}/entities"


def _connection_path(project_id: str, connection_id: str, workflow_id: Optional[str] = None) -> str:
    qs = f"?workflow_id={workflow_id}" if workflow_id else ""
    return f"{_entities_base(project_id)}/connections/{connection_id}{qs}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _paginate(items: list[Target], page: int, page_size: int) -> dict[str, Any]:
    total = len(items)
    total_pages = max(1, -(-total // page_size))
    start = (page - 1) * page_size
    sliced = items[start : start + page_size]
    return {
        "items": sliced,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        },
    }


def _filter_targets(
    items: list[Target],
    *,
    direction: Optional[str] = None,
    search: Optional[str] = None,
    type: Optional[Union[str, list[str]]] = None,
    status: Optional[Union[str, list[str]]] = None,
    workflow_id: Optional[str] = None,
) -> list[Target]:
    result = items
    if direction is not None:
        result = [
            t
            for t in result
            if t.direction == direction
            or (t.configuration or {}).get("direction") == direction
            or (t.metadata or {}).get("direction") == direction
        ]
    if search:
        q = search.lower()
        result = [t for t in result if q in t.name.lower() or q in t.key.lower()]
    if type is not None:
        types = type if isinstance(type, list) else [type]
        result = [t for t in result if t.type in types]
    if status is not None:
        statuses = status if isinstance(status, list) else [status]
        result = [t for t in result if t.status in statuses]
    if workflow_id is not None:
        result = [t for t in result if (t.workflow_id or "") == workflow_id]
    return result


def _build_create_body(
    *,
    project_id: str,
    workflow_id: str,
    key: Optional[str],
    name: str,
    type: str,
    connector_id: Optional[str] = None,
    connector_type: Optional[str] = None,
    status: Optional[str] = None,
    direction: Optional[str] = None,
    data: Optional[str] = None,
    configuration: Optional[dict[str, Any]] = None,
    metadata: Optional[dict[str, Any]] = None,
    verified: Optional[bool] = None,
    draft: Optional[bool] = None,
) -> tuple[str, dict[str, Any]]:
    connection_id = str(uuid.uuid4())
    now = _now()
    direction = direction or "outbound"
    body = {
        "connection_id": connection_id,
        "project_id": project_id,
        "workflow_id": workflow_id,
        "connector_id": connector_id,
        "connector_type": connector_type,
        "key": key or name,
        "name": name,
        "type": type,
        "status": status or "active",
        "direction": direction,
        "data": data or "{}",
        "configuration": {**(configuration or {}), "direction": direction},
        "metadata": {**(metadata or {}), "direction": direction},
        "verified": bool(verified),
        "draft": True if draft is None else draft,
        "created_at": now,
        "updated_at": now,
    }
    return connection_id, body


class TargetsApi:
    """Sync targets surface (parallel to triggers — same connections entity)."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def get(self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None) -> Target:
        pid = _require_project_id(project_id, "get")
        res = self._http.get(_connection_path(pid, id, workflow_id))
        data = res.get("data", res) if isinstance(res, dict) else res
        return Target.model_validate(data)

    def list(
        self,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        direction: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        type: Optional[Union[str, list[str]]] = None,
        status: Optional[Union[str, list[str]]] = None,
    ) -> dict[str, Any]:
        pid = _require_project_id(project_id, "list")
        res = self._http.get(_entities_base(pid))
        data = res.get("data", res) if isinstance(res, dict) else res
        raw_items = data.get("connections", []) if isinstance(data, dict) else []
        items = [Target.model_validate(item) for item in raw_items]
        items = _filter_targets(
            items, direction=direction, search=search, type=type, status=status, workflow_id=workflow_id
        )
        return _paginate(items, page, page_size)

    def create(
        self,
        *,
        project_id: str,
        workflow_id: str,
        name: str,
        type: str,
        key: Optional[str] = None,
        connector_id: Optional[str] = None,
        connector_type: Optional[str] = None,
        status: Optional[str] = None,
        direction: Optional[str] = None,
        data: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
        verified: Optional[bool] = None,
        draft: Optional[bool] = None,
    ) -> Target:
        if not workflow_id:
            raise ValueError(
                "targets.create requires workflow_id. Prefer loxtep delivery create / save_workflow_bundle."
            )
        connection_id, body = _build_create_body(
            project_id=project_id,
            workflow_id=workflow_id,
            key=key,
            name=name,
            type=type,
            connector_id=connector_id,
            connector_type=connector_type,
            status=status,
            direction=direction,
            data=data,
            configuration=configuration,
            metadata=metadata,
            verified=verified,
            draft=draft,
        )
        res = self._http.put(_connection_path(project_id, connection_id, workflow_id), body)
        result = res.get("data", res) if isinstance(res, dict) else res
        return Target.model_validate(result or body)

    def update(
        self,
        id: str,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        **fields: Any,
    ) -> Target:
        pid = _require_project_id(project_id, "update")
        existing = self.get(id, project_id=pid, workflow_id=workflow_id)
        merged = existing.model_dump()
        merged.update(fields)
        merged["connection_id"] = id
        merged["project_id"] = pid
        merged["updated_at"] = _now()
        res = self._http.put(
            _connection_path(pid, id, workflow_id or existing.workflow_id),
            merged,
        )
        result = res.get("data", res) if isinstance(res, dict) else res
        return Target.model_validate(result or merged)

    def delete(self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None) -> None:
        pid = _require_project_id(project_id, "delete")
        qs = f"?workflow_id={workflow_id}" if workflow_id else ""
        self._http.delete(f"{_entities_base(pid)}/connections/{id}{qs}")

    def test(self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None) -> dict[str, Any]:
        target = self.get(id, project_id=project_id, workflow_id=workflow_id)
        return {
            "success": True,
            "message": f'Target "{target.name}" loaded. Use MCP test_trigger for live connectivity checks.',
            "connection_id": id,
            "tested_at": _now(),
        }


class AsyncTargetsApi:
    """Async targets surface (parallel to triggers — same connections entity)."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def get(
        self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None
    ) -> Target:
        pid = _require_project_id(project_id, "get")
        res = await self._http.get(_connection_path(pid, id, workflow_id))
        data = res.get("data", res) if isinstance(res, dict) else res
        return Target.model_validate(data)

    async def list(
        self,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        direction: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        type: Optional[Union[str, list[str]]] = None,
        status: Optional[Union[str, list[str]]] = None,
    ) -> dict[str, Any]:
        pid = _require_project_id(project_id, "list")
        res = await self._http.get(_entities_base(pid))
        data = res.get("data", res) if isinstance(res, dict) else res
        raw_items = data.get("connections", []) if isinstance(data, dict) else []
        items = [Target.model_validate(item) for item in raw_items]
        items = _filter_targets(
            items, direction=direction, search=search, type=type, status=status, workflow_id=workflow_id
        )
        return _paginate(items, page, page_size)

    async def create(
        self,
        *,
        project_id: str,
        workflow_id: str,
        name: str,
        type: str,
        key: Optional[str] = None,
        connector_id: Optional[str] = None,
        connector_type: Optional[str] = None,
        status: Optional[str] = None,
        direction: Optional[str] = None,
        data: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
        verified: Optional[bool] = None,
        draft: Optional[bool] = None,
    ) -> Target:
        if not workflow_id:
            raise ValueError(
                "targets.create requires workflow_id. Prefer loxtep delivery create / save_workflow_bundle."
            )
        connection_id, body = _build_create_body(
            project_id=project_id,
            workflow_id=workflow_id,
            key=key,
            name=name,
            type=type,
            connector_id=connector_id,
            connector_type=connector_type,
            status=status,
            direction=direction,
            data=data,
            configuration=configuration,
            metadata=metadata,
            verified=verified,
            draft=draft,
        )
        res = await self._http.put(_connection_path(project_id, connection_id, workflow_id), body)
        result = res.get("data", res) if isinstance(res, dict) else res
        return Target.model_validate(result or body)

    async def update(
        self,
        id: str,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        **fields: Any,
    ) -> Target:
        pid = _require_project_id(project_id, "update")
        existing = await self.get(id, project_id=pid, workflow_id=workflow_id)
        merged = existing.model_dump()
        merged.update(fields)
        merged["connection_id"] = id
        merged["project_id"] = pid
        merged["updated_at"] = _now()
        res = await self._http.put(
            _connection_path(pid, id, workflow_id or existing.workflow_id),
            merged,
        )
        result = res.get("data", res) if isinstance(res, dict) else res
        return Target.model_validate(result or merged)

    async def delete(
        self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None
    ) -> None:
        pid = _require_project_id(project_id, "delete")
        qs = f"?workflow_id={workflow_id}" if workflow_id else ""
        await self._http.delete(f"{_entities_base(pid)}/connections/{id}{qs}")

    async def test(
        self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None
    ) -> dict[str, Any]:
        target = await self.get(id, project_id=project_id, workflow_id=workflow_id)
        return {
            "success": True,
            "message": f'Target "{target.name}" loaded. Use MCP test_trigger for live connectivity checks.',
            "connection_id": id,
            "tested_at": _now(),
        }
