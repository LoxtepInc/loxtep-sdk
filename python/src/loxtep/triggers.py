"""
Triggers API — ingest-side source bindings (workflow connection nodes).
Backend: project entities API (`/workflows/projects/{project_id}/entities`).
("connections" is the backend term; the SDK surface names these `triggers`.)

Prefer authoring new triggers via `save_workflow_bundle` / `loxtep ingest create`.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Union

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient
from .models import Trigger


def _require_project_id(project_id: Optional[str], action: str) -> str:
    if not project_id:
        raise ValueError(
            f"triggers.{action} requires project_id. Pass project_id / config.project_id, "
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


def _paginate(items: list[Trigger], page: int, page_size: int) -> dict[str, Any]:
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


def _filter_triggers(
    items: list[Trigger],
    *,
    search: Optional[str] = None,
    type: Optional[Union[str, list[str]]] = None,
    status: Optional[Union[str, list[str]]] = None,
    workflow_id: Optional[str] = None,
    verified: Optional[bool] = None,
    draft: Optional[bool] = None,
) -> list[Trigger]:
    result = items
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
    if verified is not None:
        result = [t for t in result if t.verified == verified]
    if draft is not None:
        result = [t for t in result if t.draft == draft]
    return result


def _build_create_body(
    *,
    project_id: str,
    workflow_id: str,
    key: str,
    name: str,
    type: str,
    status: Optional[str] = None,
    data: Optional[str] = None,
    configuration: Optional[dict[str, Any]] = None,
    metadata: Optional[dict[str, Any]] = None,
    verified: Optional[bool] = None,
    draft: Optional[bool] = None,
) -> tuple[str, dict[str, Any]]:
    connection_id = str(uuid.uuid4())
    now = _now()
    body = {
        "connection_id": connection_id,
        "project_id": project_id,
        "workflow_id": workflow_id,
        "key": key,
        "name": name,
        "type": type,
        "status": status or "active",
        "data": data or "{}",
        "configuration": configuration or {},
        "metadata": metadata or {},
        "verified": bool(verified),
        "draft": True if draft is None else draft,
        "created_at": now,
        "updated_at": now,
    }
    return connection_id, body


class TriggersApi:
    """Sync triggers surface (get, list, create, update, delete, test)."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def get(self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None) -> Trigger:
        pid = _require_project_id(project_id, "get")
        res = self._http.get(_connection_path(pid, id, workflow_id))
        data = res.get("data", res) if isinstance(res, dict) else res
        return Trigger.model_validate(data)

    def list(
        self,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        type: Optional[Union[str, list[str]]] = None,
        status: Optional[Union[str, list[str]]] = None,
        verified: Optional[bool] = None,
        draft: Optional[bool] = None,
    ) -> dict[str, Any]:
        pid = _require_project_id(project_id, "list")
        res = self._http.get(_entities_base(pid))
        data = res.get("data", res) if isinstance(res, dict) else res
        raw_items = data.get("connections", []) if isinstance(data, dict) else []
        items = [Trigger.model_validate(item) for item in raw_items]
        items = _filter_triggers(
            items,
            search=search,
            type=type,
            status=status,
            workflow_id=workflow_id,
            verified=verified,
            draft=draft,
        )
        return _paginate(items, page, page_size)

    def create(
        self,
        *,
        project_id: str,
        workflow_id: str,
        key: str,
        name: str,
        type: str,
        status: Optional[str] = None,
        data: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
        verified: Optional[bool] = None,
        draft: Optional[bool] = None,
    ) -> Trigger:
        if not workflow_id:
            raise ValueError(
                "triggers.create requires workflow_id (connection nodes are workflow-scoped). "
                "Prefer loxtep ingest create / save_workflow_bundle."
            )
        connection_id, body = _build_create_body(
            project_id=project_id,
            workflow_id=workflow_id,
            key=key,
            name=name,
            type=type,
            status=status,
            data=data,
            configuration=configuration,
            metadata=metadata,
            verified=verified,
            draft=draft,
        )
        res = self._http.put(_connection_path(project_id, connection_id, workflow_id), body)
        result = res.get("data", res) if isinstance(res, dict) else res
        return Trigger.model_validate(result or body)

    def update(
        self,
        id: str,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        **fields: Any,
    ) -> Trigger:
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
        return Trigger.model_validate(result or merged)

    def delete(self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None) -> None:
        pid = _require_project_id(project_id, "delete")
        qs = f"?workflow_id={workflow_id}" if workflow_id else ""
        self._http.delete(f"{_entities_base(pid)}/connections/{id}{qs}")

    def test(self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None) -> dict[str, Any]:
        trigger = self.get(id, project_id=project_id, workflow_id=workflow_id)
        cfg = trigger.configuration or {}
        probe = cfg.get("url") or cfg.get("base_url") or cfg.get("endpoint")
        return {
            "success": True,
            "message": (
                f'Trigger "{trigger.name}" loaded; probe URL present ({probe}). '
                "Live HTTP probe is available via MCP test_trigger."
                if probe
                else f'Trigger "{trigger.name}" loaded. No HTTP probe URL in configuration; '
                "use MCP test_trigger for live checks."
            ),
            "details": {"connection_id": id, "has_probe_url": bool(probe)},
            "tested_at": _now(),
        }


class AsyncTriggersApi:
    """Async triggers surface (get, list, create, update, delete, test)."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def get(
        self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None
    ) -> Trigger:
        pid = _require_project_id(project_id, "get")
        res = await self._http.get(_connection_path(pid, id, workflow_id))
        data = res.get("data", res) if isinstance(res, dict) else res
        return Trigger.model_validate(data)

    async def list(
        self,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        type: Optional[Union[str, list[str]]] = None,
        status: Optional[Union[str, list[str]]] = None,
        verified: Optional[bool] = None,
        draft: Optional[bool] = None,
    ) -> dict[str, Any]:
        pid = _require_project_id(project_id, "list")
        res = await self._http.get(_entities_base(pid))
        data = res.get("data", res) if isinstance(res, dict) else res
        raw_items = data.get("connections", []) if isinstance(data, dict) else []
        items = [Trigger.model_validate(item) for item in raw_items]
        items = _filter_triggers(
            items,
            search=search,
            type=type,
            status=status,
            workflow_id=workflow_id,
            verified=verified,
            draft=draft,
        )
        return _paginate(items, page, page_size)

    async def create(
        self,
        *,
        project_id: str,
        workflow_id: str,
        key: str,
        name: str,
        type: str,
        status: Optional[str] = None,
        data: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
        verified: Optional[bool] = None,
        draft: Optional[bool] = None,
    ) -> Trigger:
        if not workflow_id:
            raise ValueError(
                "triggers.create requires workflow_id (connection nodes are workflow-scoped). "
                "Prefer loxtep ingest create / save_workflow_bundle."
            )
        connection_id, body = _build_create_body(
            project_id=project_id,
            workflow_id=workflow_id,
            key=key,
            name=name,
            type=type,
            status=status,
            data=data,
            configuration=configuration,
            metadata=metadata,
            verified=verified,
            draft=draft,
        )
        res = await self._http.put(_connection_path(project_id, connection_id, workflow_id), body)
        result = res.get("data", res) if isinstance(res, dict) else res
        return Trigger.model_validate(result or body)

    async def update(
        self,
        id: str,
        *,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        **fields: Any,
    ) -> Trigger:
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
        return Trigger.model_validate(result or merged)

    async def delete(
        self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None
    ) -> None:
        pid = _require_project_id(project_id, "delete")
        qs = f"?workflow_id={workflow_id}" if workflow_id else ""
        await self._http.delete(f"{_entities_base(pid)}/connections/{id}{qs}")

    async def test(
        self, id: str, *, project_id: Optional[str] = None, workflow_id: Optional[str] = None
    ) -> dict[str, Any]:
        trigger = await self.get(id, project_id=project_id, workflow_id=workflow_id)
        cfg = trigger.configuration or {}
        probe = cfg.get("url") or cfg.get("base_url") or cfg.get("endpoint")
        return {
            "success": True,
            "message": (
                f'Trigger "{trigger.name}" loaded; probe URL present ({probe}). '
                "Live HTTP probe is available via MCP test_trigger."
                if probe
                else f'Trigger "{trigger.name}" loaded. No HTTP probe URL in configuration; '
                "use MCP test_trigger for live checks."
            ),
            "details": {"connection_id": id, "has_probe_url": bool(probe)},
            "tested_at": _now(),
        }
