"""
Flows API (backend: workflows). list, get (with nodes), create, get_writer.
"""

from __future__ import annotations

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

WORKFLOWS_API_BASE = "/workflows/workflows"


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class FlowsApi:
    """Sync flows surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        project_id: str,
        *,
        page: int = 1,
        page_size: int = 100,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"project_id": project_id, "page": page, "page_size": page_size}
        if status is not None:
            params["status"] = status
        if search is not None:
            params["search"] = search
        qs = _query_string(params)
        res = self._http.get(f"{WORKFLOWS_API_BASE}{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    def get(self, id: str) -> dict[str, Any]:
        flow_res = self._http.get(f"{WORKFLOWS_API_BASE}/{id}")
        flow = flow_res.get("data", flow_res) if isinstance(flow_res, dict) else flow_res
        nodes: list[dict[str, Any]] = []
        try:
            nodes_res = self._http.get(f"{WORKFLOWS_API_BASE}/{id}/nodes")
            data = nodes_res.get("data", nodes_res) if isinstance(nodes_res, dict) else {}
            nodes = data.get("items", []) if isinstance(data, dict) else []
        except Exception:
            pass
        out: dict[str, Any] = {"nodes": nodes}
        if isinstance(flow, dict):
            out["flow"] = flow
        return out

    def create(
        self,
        name: str,
        project_id: str,
        *,
        template_id: Optional[str] = None,
        description: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name, "project_id": project_id}
        if template_id is not None:
            body["template_id"] = template_id
        if description is not None:
            body["description"] = description
        if configuration is not None:
            body["configuration"] = configuration
        res = self._http.post(WORKFLOWS_API_BASE, body)
        return res.get("data", res) if isinstance(res, dict) else res

    def get_writer(self, flow_id: str) -> FlowWriter:
        """Return a sync flow writer (stub: write/close no-op or raise)."""
        return FlowWriter(flow_id=flow_id, http=self._http)


class FlowWriter:
    """Sync flow writer: write(event), close()."""

    def __init__(self, flow_id: str, http: LoxtepHttpClient) -> None:
        self._flow_id = flow_id
        self._http = http

    def write(self, event: dict[str, Any]) -> None:
        """Enqueue event. Stub: POST to flow ingest endpoint when available."""
        self._http.post(f"{WORKFLOWS_API_BASE}/{self._flow_id}/events", event)

    def close(self) -> None:
        """Flush and close. No-op for in-memory stub."""
        pass


class AsyncFlowsApi:
    """Async flows surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        project_id: str,
        *,
        page: int = 1,
        page_size: int = 100,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"project_id": project_id, "page": page, "page_size": page_size}
        if status is not None:
            params["status"] = status
        if search is not None:
            params["search"] = search
        qs = _query_string(params)
        res = await self._http.get(f"{WORKFLOWS_API_BASE}{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    async def get(self, id: str) -> dict[str, Any]:
        flow_res = await self._http.get(f"{WORKFLOWS_API_BASE}/{id}")
        flow = flow_res.get("data", flow_res) if isinstance(flow_res, dict) else flow_res
        nodes: list[dict[str, Any]] = []
        try:
            nodes_res = await self._http.get(f"{WORKFLOWS_API_BASE}/{id}/nodes")
            data = nodes_res.get("data", nodes_res) if isinstance(nodes_res, dict) else {}
            nodes = data.get("items", []) if isinstance(data, dict) else []
        except Exception:
            pass
        out_async: dict[str, Any] = {"nodes": nodes}
        if isinstance(flow, dict):
            out_async["flow"] = flow
        return out_async

    async def create(
        self,
        name: str,
        project_id: str,
        *,
        template_id: Optional[str] = None,
        description: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name, "project_id": project_id}
        if template_id is not None:
            body["template_id"] = template_id
        if description is not None:
            body["description"] = description
        if configuration is not None:
            body["configuration"] = configuration
        res = await self._http.post(WORKFLOWS_API_BASE, body)
        return res.get("data", res) if isinstance(res, dict) else res

    def get_writer(self, flow_id: str) -> "AsyncFlowWriter":
        return AsyncFlowWriter(flow_id=flow_id, http=self._http)


class AsyncFlowWriter:
    """Async flow writer."""

    def __init__(self, flow_id: str, http: AsyncLoxtepHttpClient) -> None:
        self._flow_id = flow_id
        self._http = http

    async def write(self, event: dict[str, Any]) -> None:
        await self._http.post(f"{WORKFLOWS_API_BASE}/{self._flow_id}/events", event)

    async def close(self) -> None:
        pass
