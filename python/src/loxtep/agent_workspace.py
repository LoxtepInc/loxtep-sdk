"""
Agent workspace read API (LOX-1250).
Thin wraps for MCP loxtep_context list/get issues, goals, workstreams.

  GET /agent-orchestration/organizations/{org}/issues
  GET /agent-orchestration/issues/{issue_id}
  GET /agent-orchestration/organizations/{org}/goals
  GET /agent-orchestration/goals/{goal_id}
  GET /agent-orchestration/organizations/{org}/workstreams
  GET /agent-orchestration/workstreams/{workstream_id}

Writes (create/update issue, create goal, create/update workstream,
add_issue_comment) are deferred — use MCP ``loxtep_context`` until shipped.
"""

from __future__ import annotations

from typing import Any, Optional
from urllib.parse import urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

AO_PREFIX = "/agent-orchestration"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _query_string(params: dict[str, Any]) -> str:
    clean = {k: str(v) for k, v in params.items() if v is not None}
    return "?" + urlencode(clean) if clean else ""


def _normalize_list(payload: Any, collection_keys: list[str]) -> dict[str, Any]:
    if isinstance(payload, list):
        return {"items": payload, "total": len(payload), "pagination": None}
    if not isinstance(payload, dict):
        return {"items": [], "pagination": None}
    items = payload.get("items")
    if not isinstance(items, list):
        items = []
        for key in collection_keys:
            candidate = payload.get(key)
            if isinstance(candidate, list):
                items = candidate
                break
    out: dict[str, Any] = {
        "items": items,
        "pagination": payload.get("pagination"),
    }
    if "total" in payload:
        out["total"] = payload.get("total")
    return out


class _OrgMixin:
    _organization_id: Optional[str]

    def _resolve_org(self, override: Optional[str] = None) -> str:
        org = override or self._organization_id
        if not org:
            raise ValueError(
                "organization_id is required for agent workspace calls "
                "(set it on the client or pass it explicitly)"
            )
        return org


class IssuesApi(_OrgMixin):
    """Sync issues read surface."""

    def __init__(
        self,
        http: LoxtepHttpClient,
        *,
        organization_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    def list(
        self,
        *,
        organization_id: Optional[str] = None,
        workstream_id: Optional[str] = None,
        goal_id: Optional[str] = None,
        status: Optional[str] = None,
        assignee_agent_id: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(organization_id)
        qs = _query_string(
            {
                "workstream_id": workstream_id,
                "goal_id": goal_id,
                "status": status,
                "assignee_agent_id": assignee_agent_id,
                "page": page,
                "page_size": page_size,
            }
        )
        path = f"{AO_PREFIX}/organizations/{org}/issues{qs}"
        return _normalize_list(_unwrap(self._http.get(path)), ["issues"])

    def list_issues(self, **kwargs: Any) -> dict[str, Any]:
        return self.list(**kwargs)

    def get(self, issue_id: str) -> Any:
        if not issue_id:
            raise ValueError("issue_id is required")
        return _unwrap(self._http.get(f"{AO_PREFIX}/issues/{issue_id}"))

    def get_issue(self, issue_id: str) -> Any:
        return self.get(issue_id)


class GoalsApi(_OrgMixin):
    """Sync goals read surface."""

    def __init__(
        self,
        http: LoxtepHttpClient,
        *,
        organization_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    def list(
        self,
        *,
        organization_id: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(organization_id)
        qs = _query_string({"page": page, "page_size": page_size})
        path = f"{AO_PREFIX}/organizations/{org}/goals{qs}"
        return _normalize_list(_unwrap(self._http.get(path)), ["goals"])

    def list_goals(self, **kwargs: Any) -> dict[str, Any]:
        return self.list(**kwargs)

    def get(self, goal_id: str) -> Any:
        if not goal_id:
            raise ValueError("goal_id is required")
        return _unwrap(self._http.get(f"{AO_PREFIX}/goals/{goal_id}"))

    def get_goal(self, goal_id: str) -> Any:
        return self.get(goal_id)


class WorkstreamsApi(_OrgMixin):
    """Sync workstreams read surface."""

    def __init__(
        self,
        http: LoxtepHttpClient,
        *,
        organization_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    def list(
        self,
        *,
        organization_id: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(organization_id)
        qs = _query_string({"page": page, "page_size": page_size})
        path = f"{AO_PREFIX}/organizations/{org}/workstreams{qs}"
        return _normalize_list(_unwrap(self._http.get(path)), ["workstreams"])

    def list_workstreams(self, **kwargs: Any) -> dict[str, Any]:
        return self.list(**kwargs)

    def get(self, workstream_id: str) -> Any:
        if not workstream_id:
            raise ValueError("workstream_id is required")
        return _unwrap(self._http.get(f"{AO_PREFIX}/workstreams/{workstream_id}"))

    def get_workstream(self, workstream_id: str) -> Any:
        return self.get(workstream_id)


class AsyncIssuesApi(_OrgMixin):
    """Async issues read surface."""

    def __init__(
        self,
        http: AsyncLoxtepHttpClient,
        *,
        organization_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    async def list(
        self,
        *,
        organization_id: Optional[str] = None,
        workstream_id: Optional[str] = None,
        goal_id: Optional[str] = None,
        status: Optional[str] = None,
        assignee_agent_id: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(organization_id)
        qs = _query_string(
            {
                "workstream_id": workstream_id,
                "goal_id": goal_id,
                "status": status,
                "assignee_agent_id": assignee_agent_id,
                "page": page,
                "page_size": page_size,
            }
        )
        path = f"{AO_PREFIX}/organizations/{org}/issues{qs}"
        return _normalize_list(_unwrap(await self._http.get(path)), ["issues"])

    async def list_issues(self, **kwargs: Any) -> dict[str, Any]:
        return await self.list(**kwargs)

    async def get(self, issue_id: str) -> Any:
        if not issue_id:
            raise ValueError("issue_id is required")
        return _unwrap(await self._http.get(f"{AO_PREFIX}/issues/{issue_id}"))

    async def get_issue(self, issue_id: str) -> Any:
        return await self.get(issue_id)


class AsyncGoalsApi(_OrgMixin):
    """Async goals read surface."""

    def __init__(
        self,
        http: AsyncLoxtepHttpClient,
        *,
        organization_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    async def list(
        self,
        *,
        organization_id: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(organization_id)
        qs = _query_string({"page": page, "page_size": page_size})
        path = f"{AO_PREFIX}/organizations/{org}/goals{qs}"
        return _normalize_list(_unwrap(await self._http.get(path)), ["goals"])

    async def list_goals(self, **kwargs: Any) -> dict[str, Any]:
        return await self.list(**kwargs)

    async def get(self, goal_id: str) -> Any:
        if not goal_id:
            raise ValueError("goal_id is required")
        return _unwrap(await self._http.get(f"{AO_PREFIX}/goals/{goal_id}"))

    async def get_goal(self, goal_id: str) -> Any:
        return await self.get(goal_id)


class AsyncWorkstreamsApi(_OrgMixin):
    """Async workstreams read surface."""

    def __init__(
        self,
        http: AsyncLoxtepHttpClient,
        *,
        organization_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    async def list(
        self,
        *,
        organization_id: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(organization_id)
        qs = _query_string({"page": page, "page_size": page_size})
        path = f"{AO_PREFIX}/organizations/{org}/workstreams{qs}"
        return _normalize_list(_unwrap(await self._http.get(path)), ["workstreams"])

    async def list_workstreams(self, **kwargs: Any) -> dict[str, Any]:
        return await self.list(**kwargs)

    async def get(self, workstream_id: str) -> Any:
        if not workstream_id:
            raise ValueError("workstream_id is required")
        return _unwrap(await self._http.get(f"{AO_PREFIX}/workstreams/{workstream_id}"))

    async def get_workstream(self, workstream_id: str) -> Any:
        return await self.get(workstream_id)
