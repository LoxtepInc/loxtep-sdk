"""
Workflows API: list_workflows, get_workflow_graph, create_workflow, deploy.
Backend: workflows microservice (/workflows/workflows, graph, projects/:id/deploy).
snake_case per backend conventions.
"""

from typing import Any, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

WORKFLOWS_BASE = "/workflows/workflows"
PROJECTS_BASE = "/workflows/projects"


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={quote(str(v))}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


def _data(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


class WorkflowsApi:
    """Sync client for workflow list, graph, create, and project deploy."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list_workflows(
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

    def get_workflow_graph(self, workflow_id: str, project_id: str) -> dict[str, Any]:
        qs = _query_string({"project_id": project_id})
        path = f"{WORKFLOWS_BASE}/{quote(workflow_id)}/graph{qs}"
        res = self._http.get(path)
        return _data(res)

    def create_workflow(self, input: dict[str, Any]) -> dict[str, Any]:
        res = self._http.post(WORKFLOWS_BASE, input)
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


class AsyncWorkflowsApi:
    """Async client for workflow list, graph, create, and project deploy."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list_workflows(
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

    async def get_workflow_graph(self, workflow_id: str, project_id: str) -> dict[str, Any]:
        qs = _query_string({"project_id": project_id})
        path = f"{WORKFLOWS_BASE}/{quote(workflow_id)}/graph{qs}"
        res = await self._http.get(path)
        return _data(res)

    async def create_workflow(self, input: dict[str, Any]) -> dict[str, Any]:
        res = await self._http.post(WORKFLOWS_BASE, input)
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
