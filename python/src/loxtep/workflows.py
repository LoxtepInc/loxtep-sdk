"""
Workflows API: list, get (with nodes), create, get_graph, deploy, get_writer.
Backend: workflows microservice (/workflows/workflows, graph, projects/:id/deploy).
snake_case per backend conventions.

The former ``flows`` namespace has been folded in here (same backend entity).
``get_writer`` is a low-level stream-writer escape hatch — internal; customers
should use ``data_products.get_writer``.
"""

from typing import Any, Literal, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

WORKFLOWS_BASE = "/workflows/workflows"
PROJECTS_BASE = "/workflows/projects"

WorkflowType = Literal["ingestion", "enrichment", "delivery"]
"""Required by backend POST /workflows (nodejs/src/client/flow-types.ts FlowCreateInput)."""


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={quote(str(v))}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


def _data(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


class WorkflowsApi:
    """Sync client for workflow list, get, create, graph, deploy, and writer."""

    def __init__(self, http: LoxtepHttpClient, stream_config: Optional[Any] = None) -> None:
        self._http = http
        self._stream_config = stream_config

    def list(
        self,
        project_id: str,
        *,
        page: int = 1,
        page_size: int = 100,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "project_id": project_id,
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

    def __init__(self, http: AsyncLoxtepHttpClient, stream_config: Optional[Any] = None) -> None:
        self._http = http
        self._stream_config = stream_config

    async def list(
        self,
        project_id: str,
        *,
        page: int = 1,
        page_size: int = 100,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "project_id": project_id,
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
