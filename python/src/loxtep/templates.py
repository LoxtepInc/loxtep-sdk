"""
Templates API: list, get.
Canonical API: GET /dataproducts/templates, GET /dataproducts/templates/:template_id (dataproducts).
Path must match API Gateway (frontend uses /dataproducts/templates).
Apply template: use client.projects.apply_template(project_id, ...).
"""

from typing import Any, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

TEMPLATES_BASE = "/dataproducts/templates"


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={quote(str(v))}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


def _data(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


class TemplatesApi:
    """Sync templates surface: list, get."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        category: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if category is not None:
            params["category"] = category
        if search is not None:
            params["search"] = search
        qs = _query_string(params)
        res = self._http.get(f"{TEMPLATES_BASE}{qs}")
        return _data(res)

    def get(self, template_id: str) -> dict[str, Any]:
        path = f"{TEMPLATES_BASE}/{quote(template_id)}"
        res = self._http.get(path)
        return _data(res)


class AsyncTemplatesApi:
    """Async templates surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        category: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if category is not None:
            params["category"] = category
        if search is not None:
            params["search"] = search
        qs = _query_string(params)
        res = await self._http.get(f"{TEMPLATES_BASE}{qs}")
        return _data(res)

    async def get(self, template_id: str) -> dict[str, Any]:
        path = f"{TEMPLATES_BASE}/{quote(template_id)}"
        res = await self._http.get(path)
        return _data(res)
