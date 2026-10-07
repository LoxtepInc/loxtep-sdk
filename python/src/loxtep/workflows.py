"""
Workflows API: list, get (with nodes), create, get_graph, deploy, get_writer,
preview/run query_trigger.
Backend: workflows microservice (/workflows/workflows, graph, projects/:id/deploy).
snake_case per backend conventions.

The former ``flows`` namespace has been folded in here (same backend entity).
``get_writer`` is a low-level stream-writer escape hatch — internal; customers
should use ``data_products.get_writer``.
Query-trigger preview/run call MCP ``loxtep_build`` via ``POST /ai/mcp/tools/call``.
"""

from __future__ import annotations

import json
from typing import Any, Literal, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

WORKFLOWS_BASE = "/workflows/workflows"
PROJECTS_BASE = "/workflows/projects"
MCP_TOOLS_PATH = "/ai/mcp/tools/call"

WorkflowType = Literal["ingestion", "enrichment", "delivery"]
"""Required by backend POST /workflows (nodejs/src/client/flow-types.ts FlowCreateInput)."""


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={quote(str(v))}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


def _data(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _parse_tool_response(res: Any) -> Any:
    data = res.get("data") if isinstance(res, dict) else None
    content = data.get("content") if isinstance(data, dict) else None
    if content and isinstance(content, list) and len(content) > 0:
        first = content[0]
        if isinstance(first, dict) and first.get("type") == "text" and "text" in first:
            try:
                return json.loads(first["text"])
            except (json.JSONDecodeError, TypeError):
                return {"raw": first["text"]}
    return res


def _unwrap_tool_payload(parsed: Any) -> Any:
    if isinstance(parsed, dict) and parsed.get("success") is False:
        err = parsed.get("error") or "Build operation failed"
        raise RuntimeError(str(err))
    if isinstance(parsed, dict) and "data" in parsed:
        return parsed["data"]
    return parsed


class WorkflowsApi:
    """Sync client for workflow list, get, create, graph, deploy, and writer."""

    def __init__(
        self,
        http: LoxtepHttpClient,
        stream_config: Optional[Any] = None,
        project_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._stream_config = stream_config
        self._project_id = project_id

    def _call_build(self, operation: str, args: Optional[dict[str, Any]] = None) -> Any:
        body = {"name": "loxtep_build", "arguments": {"operation": operation, **(args or {})}}
        res = self._http.post(MCP_TOOLS_PATH, body)
        return _unwrap_tool_payload(_parse_tool_response(res))

    def list(
        self,
        project_id: Optional[str] = None,
        *,
        page: int = 1,
        page_size: int = 100,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        resolved_project_id = project_id or self._project_id
        if not resolved_project_id:
            raise ValueError(
                "workflows.list requires project_id. Pass project_id or construct the client with one."
            )
        params: dict[str, Any] = {
            "project_id": resolved_project_id,
            "page": page,
            "page_size": page_size,
        }
        if status is not None:
            params["status"] = status
        if search is not None:
            params["search"] = search
        qs = _query_string(params)
        res = self._http.get(f"{WORKFLOWS_BASE}{qs}")
        return _data(res)

    def get(self, id: str) -> dict[str, Any]:
        flow_res = self._http.get(f"{WORKFLOWS_BASE}/{quote(id)}")
        flow = _data(flow_res)
        nodes: list[dict[str, Any]] = []
        try:
            nodes_res = self._http.get(f"{WORKFLOWS_BASE}/{quote(id)}/nodes")
            data = _data(nodes_res)
            nodes = data.get("items", []) if isinstance(data, dict) else []
        except Exception:
            pass
        out: dict[str, Any] = {"nodes": nodes}
        if isinstance(flow, dict):
            out["workflow"] = flow
        return out

    def create(
        self,
        name: str,
        project_id: str,
        *,
        workflow_type: WorkflowType,
        domain_id: str,
        connection_id: Optional[str] = None,
        template_id: Optional[str] = None,
        description: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a workflow. `workflow_type` and `domain_id` are required by the
        backend (`POST /workflows`) — omitting them 500s with a raw DB error."""
        body: dict[str, Any] = {
            "name": name,
            "project_id": project_id,
            "workflow_type": workflow_type,
            "domain_id": domain_id,
        }
        if connection_id is not None:
            body["connection_id"] = connection_id
        if template_id is not None:
            body["template_id"] = template_id
        if description is not None:
            body["description"] = description
        if configuration is not None:
            body["configuration"] = configuration
        res = self._http.post(WORKFLOWS_BASE, body)
        return _data(res)

    def get_graph(self, workflow_id: str, project_id: str) -> dict[str, Any]:
        qs = _query_string({"project_id": project_id})
        path = f"{WORKFLOWS_BASE}/{quote(workflow_id)}/graph{qs}"
        res = self._http.get(path)
        return _data(res)

    def deploy(
        self,
        project_id: str,
        instance_id: str,
        *,
        version_id: Optional[str] = None,
        force_redeploy: bool = False,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "instance_id": instance_id,
            "force_redeploy": force_redeploy,
        }
        if version_id is not None:
            body["version_id"] = version_id
        path = f"{PROJECTS_BASE}/{quote(project_id)}/deploy"
        res = self._http.post(path, body)
        return _data(res)

    def preview_query_trigger(
        self,
        workflow_id: str,
        *,
        query: Optional[str] = None,
        primary_key: Optional[list[str]] = None,
        limit: Optional[int] = None,
    ) -> Any:
        """Dry-run SELECT sample for enrichment ``trigger.query_trigger``."""
        if not workflow_id:
            raise ValueError("workflow_id is required")
        args: dict[str, Any] = {"workflow_id": workflow_id}
        if query is not None:
            args["query"] = query
        if primary_key is not None:
            args["primary_key"] = primary_key
        if limit is not None:
            args["limit"] = limit
        return self._call_build("preview_query_trigger", args)

    def run_query_trigger(
        self,
        workflow_id: str,
        *,
        query: Optional[str] = None,
        primary_key: Optional[list[str]] = None,
        sink_data_product_id: Optional[str] = None,
    ) -> Any:
        """On-demand invoke of query_trigger producer (upsert; does not wipe)."""
        if not workflow_id:
            raise ValueError("workflow_id is required")
        args: dict[str, Any] = {"workflow_id": workflow_id}
        if query is not None:
            args["query"] = query
        if primary_key is not None:
            args["primary_key"] = primary_key
        if sink_data_product_id is not None:
            args["sink_data_product_id"] = sink_data_product_id
        return self._call_build("run_query_trigger", args)

    def get_writer(
        self, workflow_id: str, *, bot_id: Optional[str] = None, queue_name: Optional[str] = None
    ) -> Any:
        """Low-level stream-writer escape hatch. Internal — prefer
        ``data_products.get_writer``.

        Uses the Kinesis stream bus when the client has stream config and a
        queue is available; otherwise an HTTP writer.
        """
        cfg = self._stream_config
        if cfg is not None and getattr(cfg, "is_writable", False) and queue_name:
            from .rstreams import LoxtepStreamWriter

            return LoxtepStreamWriter(cfg, bot_id or f"sdk-writer-{workflow_id}", queue_name)
        return WorkflowWriter(workflow_id=workflow_id, http=self._http)


class WorkflowWriter:
    """Sync workflow writer: write(event), close(). Internal escape hatch."""

    def __init__(self, workflow_id: str, http: LoxtepHttpClient) -> None:
        self._workflow_id = workflow_id
        self._http = http

    def write(self, event: dict[str, Any]) -> None:
        self._http.post(f"{WORKFLOWS_BASE}/{self._workflow_id}/events", event)

    def close(self) -> None:
        pass


class AsyncWorkflowsApi:
    """Async client for workflow list, get, create, graph, deploy, and writer."""

    def __init__(
        self,
        http: AsyncLoxtepHttpClient,
        stream_config: Optional[Any] = None,
        project_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._stream_config = stream_config
        self._project_id = project_id

    async def _call_build(self, operation: str, args: Optional[dict[str, Any]] = None) -> Any:
        body = {"name": "loxtep_build", "arguments": {"operation": operation, **(args or {})}}
        res = await self._http.post(MCP_TOOLS_PATH, body)
        return _unwrap_tool_payload(_parse_tool_response(res))

    async def list(
        self,
        project_id: Optional[str] = None,
        *,
        page: int = 1,
        page_size: int = 100,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        resolved_project_id = project_id or self._project_id
        if not resolved_project_id:
            raise ValueError(
                "workflows.list requires project_id. Pass project_id or construct the client with one."
            )
        params: dict[str, Any] = {
            "project_id": resolved_project_id,
            "page": page,
            "page_size": page_size,
        }
        if status is not None:
            params["status"] = status
        if search is not None:
            params["search"] = search
        qs = _query_string(params)
        res = await self._http.get(f"{WORKFLOWS_BASE}{qs}")
        return _data(res)

    async def get(self, id: str) -> dict[str, Any]:
        flow_res = await self._http.get(f"{WORKFLOWS_BASE}/{quote(id)}")
        flow = _data(flow_res)
        nodes: list[dict[str, Any]] = []
        try:
            nodes_res = await self._http.get(f"{WORKFLOWS_BASE}/{quote(id)}/nodes")
            data = _data(nodes_res)
            nodes = data.get("items", []) if isinstance(data, dict) else []
        except Exception:
            pass
        out: dict[str, Any] = {"nodes": nodes}
        if isinstance(flow, dict):
            out["workflow"] = flow
        return out

    async def create(
        self,
        name: str,
        project_id: str,
        *,
        workflow_type: WorkflowType,
        domain_id: str,
        connection_id: Optional[str] = None,
        template_id: Optional[str] = None,
        description: Optional[str] = None,
        configuration: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a workflow. `workflow_type` and `domain_id` are required by the
        backend (`POST /workflows`) — omitting them 500s with a raw DB error."""
        body: dict[str, Any] = {
            "name": name,
            "project_id": project_id,
            "workflow_type": workflow_type,
            "domain_id": domain_id,
        }
        if connection_id is not None:
            body["connection_id"] = connection_id
        if template_id is not None:
            body["template_id"] = template_id
        if description is not None:
            body["description"] = description
        if configuration is not None:
            body["configuration"] = configuration
        res = await self._http.post(WORKFLOWS_BASE, body)
        return _data(res)

    async def get_graph(self, workflow_id: str, project_id: str) -> dict[str, Any]:
        qs = _query_string({"project_id": project_id})
        path = f"{WORKFLOWS_BASE}/{quote(workflow_id)}/graph{qs}"
        res = await self._http.get(path)
        return _data(res)

    async def deploy(
        self,
        project_id: str,
        instance_id: str,
        *,
        version_id: Optional[str] = None,
        force_redeploy: bool = False,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "instance_id": instance_id,
            "force_redeploy": force_redeploy,
        }
        if version_id is not None:
            body["version_id"] = version_id
        path = f"{PROJECTS_BASE}/{quote(project_id)}/deploy"
        res = await self._http.post(path, body)
        return _data(res)

    async def preview_query_trigger(
        self,
        workflow_id: str,
        *,
        query: Optional[str] = None,
        primary_key: Optional[list[str]] = None,
        limit: Optional[int] = None,
    ) -> Any:
        """Dry-run SELECT sample for enrichment ``trigger.query_trigger``."""
        if not workflow_id:
            raise ValueError("workflow_id is required")
        args: dict[str, Any] = {"workflow_id": workflow_id}
        if query is not None:
            args["query"] = query
        if primary_key is not None:
            args["primary_key"] = primary_key
        if limit is not None:
            args["limit"] = limit
        return await self._call_build("preview_query_trigger", args)

    async def run_query_trigger(
        self,
        workflow_id: str,
        *,
        query: Optional[str] = None,
        primary_key: Optional[list[str]] = None,
        sink_data_product_id: Optional[str] = None,
    ) -> Any:
        """On-demand invoke of query_trigger producer (upsert; does not wipe)."""
        if not workflow_id:
            raise ValueError("workflow_id is required")
        args: dict[str, Any] = {"workflow_id": workflow_id}
        if query is not None:
            args["query"] = query
        if primary_key is not None:
            args["primary_key"] = primary_key
        if sink_data_product_id is not None:
            args["sink_data_product_id"] = sink_data_product_id
        return await self._call_build("run_query_trigger", args)

    def get_writer(
        self, workflow_id: str, *, bot_id: Optional[str] = None, queue_name: Optional[str] = None
    ) -> Any:
        """Low-level stream-writer escape hatch. Internal — prefer
        ``data_products.get_writer``. Uses the Kinesis bus when configured."""
        cfg = self._stream_config
        if cfg is not None and getattr(cfg, "is_writable", False) and queue_name:
            from .rstreams import AsyncLoxtepStreamWriter

            return AsyncLoxtepStreamWriter(cfg, bot_id or f"sdk-writer-{workflow_id}", queue_name)
        return AsyncWorkflowWriter(workflow_id=workflow_id, http=self._http)


class AsyncWorkflowWriter:
    """Async workflow writer. Internal escape hatch."""

    def __init__(self, workflow_id: str, http: AsyncLoxtepHttpClient) -> None:
        self._workflow_id = workflow_id
        self._http = http

    async def write(self, event: dict[str, Any]) -> None:
        await self._http.post(f"{WORKFLOWS_BASE}/{self._workflow_id}/events", event)

    async def close(self) -> None:
        pass
