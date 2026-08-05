"""
Projects API: list, get, create, update, delete.
Canonical API: GET/POST /workflows/projects, GET/PUT/DELETE /workflows/projects/:project_id.
snake_case per backend conventions.
"""

from typing import Any, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

PROJECTS_BASE = "/workflows/projects"


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={quote(str(v))}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


def _data(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


class ProjectsApi:
    """Sync projects surface: list, get, create, update, delete, apply_template."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 100,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if status is not None:
            params["status"] = status
        if search is not None:
            params["search"] = search
        qs = _query_string(params)
        res = self._http.get(f"{PROJECTS_BASE}{qs}")
        return _data(res)

    def get(self, project_id: str) -> dict[str, Any]:
        path = f"{PROJECTS_BASE}/{quote(project_id)}"
        res = self._http.get(path)
        return _data(res)

    def create(
        self,
        name: str,
        *,
        description: Optional[str] = None,
        status: str = "active",
        metadata: Optional[dict[str, Any]] = None,
        configuration: Optional[dict[str, Any]] = None,
        template_slug: Optional[str] = None,
        domain_id: Optional[str] = None,
        github_action: str = "none",
        github_repo_name: Optional[str] = None,
        github_import_url: Optional[str] = None,
        repository_branch: Optional[str] = None,
        github_branch: Optional[str] = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name, "status": status, **kwargs}
        if description is not None:
            body["description"] = description
        if metadata is not None:
            body["metadata"] = metadata
        if configuration is not None:
            body["configuration"] = configuration
        if template_slug is not None:
            body["template_slug"] = template_slug
        if domain_id is not None:
            body["domain_id"] = domain_id
        body["github_action"] = github_action
        if github_repo_name is not None:
            body["github_repo_name"] = github_repo_name
        if github_import_url is not None:
            body["github_import_url"] = github_import_url
        if repository_branch is not None:
            body["repository_branch"] = repository_branch
        if github_branch is not None:
            body["github_branch"] = github_branch
        res = self._http.post(PROJECTS_BASE, body)
        return _data(res)

    def update(
        self,
        project_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        configuration: Optional[dict[str, Any]] = None,
        repository_url: Optional[str] = None,
        repository_branch: Optional[str] = None,
        github_repo_url: Optional[str] = None,
        github_repo_name: Optional[str] = None,
        github_repo_path: Optional[str] = None,
        customer_role_arn: Optional[str] = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        body: dict[str, Any] = dict(kwargs)
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description
        if status is not None:
            body["status"] = status
        if metadata is not None:
            body["metadata"] = metadata
        if configuration is not None:
            body["configuration"] = configuration
        if repository_url is not None:
            body["repository_url"] = repository_url
        if repository_branch is not None:
            body["repository_branch"] = repository_branch
        if github_repo_url is not None:
            body["github_repo_url"] = github_repo_url
        if github_repo_name is not None:
            body["github_repo_name"] = github_repo_name
        if github_repo_path is not None:
            body["github_repo_path"] = github_repo_path
        if customer_role_arn is not None:
            body["customer_role_arn"] = customer_role_arn
        path = f"{PROJECTS_BASE}/{quote(project_id)}"
        res = self._http.put(path, body)
        return _data(res)

    def delete(self, project_id: str) -> dict[str, Any]:
        path = f"{PROJECTS_BASE}/{quote(project_id)}"
        res = self._http.delete(path)
        return _data(res)

    def apply_template(
        self,
        project_id: str,
        *,
        template_type: str,
        template_slug: str,
        preview: bool = False,
        placeholder_overrides: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "template_type": template_type,
            "template_slug": template_slug,
            "preview": preview,
        }
        if placeholder_overrides is not None:
            body["placeholder_overrides"] = placeholder_overrides
        path = f"{PROJECTS_BASE}/{quote(project_id)}/templates"
        res = self._http.post(path, body)
        return _data(res)

    def repository(self, project_id: str) -> dict[str, Any]:
        """Return the project's repository binding (github_* fields mapped)."""
        res = self._http.get(f"{PROJECTS_BASE}/{quote(project_id)}")
        p = _data(res)
        p = p if isinstance(p, dict) else {}
        return {
            "url": p.get("github_repo_url"),
            "name": p.get("github_repo_name"),
            "subpath": p.get("github_repo_path", ""),
            "branch": p.get("github_branch", "main"),
            "last_commit_sha": p.get("github_last_commit_sha", ""),
            "last_sync_at": p.get("github_last_sync_at", ""),
        }

    def reindex(self, project_id: str) -> Any:
        """POST /workflows/projects/:id/reindex — refresh customer_workspace_entity_index.

        Required after `save_workflow_bundle`/direct S3 writes before `deploy` will see
        the new entities: the deploy bot reads from this index table, not S3 directly,
        and a bundle save alone doesn't refresh it.
        """
        path = f"{PROJECTS_BASE}/{quote(project_id)}/reindex"
        res = self._http.post(path, {})
        return _data(res)


class AsyncProjectsApi:
    """Async projects surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 100,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if status is not None:
            params["status"] = status
        if search is not None:
            params["search"] = search
        qs = _query_string(params)
        res = await self._http.get(f"{PROJECTS_BASE}{qs}")
        return _data(res)

    async def get(self, project_id: str) -> dict[str, Any]:
        path = f"{PROJECTS_BASE}/{quote(project_id)}"
        res = await self._http.get(path)
        return _data(res)

    async def create(
        self,
        name: str,
        *,
        description: Optional[str] = None,
        status: str = "active",
        metadata: Optional[dict[str, Any]] = None,
        configuration: Optional[dict[str, Any]] = None,
        template_slug: Optional[str] = None,
        domain_id: Optional[str] = None,
        github_action: str = "none",
        github_repo_name: Optional[str] = None,
        github_import_url: Optional[str] = None,
        repository_branch: Optional[str] = None,
        github_branch: Optional[str] = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name, "status": status, **kwargs}
        if description is not None:
            body["description"] = description
        if metadata is not None:
            body["metadata"] = metadata
        if configuration is not None:
            body["configuration"] = configuration
        if template_slug is not None:
            body["template_slug"] = template_slug
        if domain_id is not None:
            body["domain_id"] = domain_id
        body["github_action"] = github_action
        if github_repo_name is not None:
            body["github_repo_name"] = github_repo_name
        if github_import_url is not None:
            body["github_import_url"] = github_import_url
        if repository_branch is not None:
            body["repository_branch"] = repository_branch
        if github_branch is not None:
            body["github_branch"] = github_branch
        res = await self._http.post(PROJECTS_BASE, body)
        return _data(res)

    async def update(
        self,
        project_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        configuration: Optional[dict[str, Any]] = None,
        repository_url: Optional[str] = None,
        repository_branch: Optional[str] = None,
        github_repo_url: Optional[str] = None,
        github_repo_name: Optional[str] = None,
        github_repo_path: Optional[str] = None,
        customer_role_arn: Optional[str] = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        body: dict[str, Any] = dict(kwargs)
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description
        if status is not None:
            body["status"] = status
        if metadata is not None:
            body["metadata"] = metadata
        if configuration is not None:
            body["configuration"] = configuration
        if repository_url is not None:
            body["repository_url"] = repository_url
        if repository_branch is not None:
            body["repository_branch"] = repository_branch
        if github_repo_url is not None:
            body["github_repo_url"] = github_repo_url
        if github_repo_name is not None:
            body["github_repo_name"] = github_repo_name
        if github_repo_path is not None:
            body["github_repo_path"] = github_repo_path
        if customer_role_arn is not None:
            body["customer_role_arn"] = customer_role_arn
        path = f"{PROJECTS_BASE}/{quote(project_id)}"
        res = await self._http.put(path, body)
        return _data(res)

    async def delete(self, project_id: str) -> dict[str, Any]:
        path = f"{PROJECTS_BASE}/{quote(project_id)}"
        res = await self._http.delete(path)
        return _data(res)

    async def apply_template(
        self,
        project_id: str,
        *,
        template_type: str,
        template_slug: str,
        preview: bool = False,
        placeholder_overrides: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "template_type": template_type,
            "template_slug": template_slug,
            "preview": preview,
        }
        if placeholder_overrides is not None:
            body["placeholder_overrides"] = placeholder_overrides
        path = f"{PROJECTS_BASE}/{quote(project_id)}/templates"
        res = await self._http.post(path, body)
        return _data(res)

    async def repository(self, project_id: str) -> dict[str, Any]:
        res = await self._http.get(f"{PROJECTS_BASE}/{quote(project_id)}")
        p = _data(res)
        p = p if isinstance(p, dict) else {}
        return {
            "url": p.get("github_repo_url"),
            "name": p.get("github_repo_name"),
            "subpath": p.get("github_repo_path", ""),
            "branch": p.get("github_branch", "main"),
            "last_commit_sha": p.get("github_last_commit_sha", ""),
            "last_sync_at": p.get("github_last_sync_at", ""),
        }

    async def reindex(self, project_id: str) -> Any:
        """POST /workflows/projects/:id/reindex — refresh customer_workspace_entity_index.

        See ``ProjectsApi.reindex`` for why this is needed before ``deploy``.
        """
        path = f"{PROJECTS_BASE}/{quote(project_id)}/reindex"
        res = await self._http.post(path, {})
        return _data(res)
