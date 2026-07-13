"""
Discovery API (MCP tools: search_catalog, get_evidence, get_lineage_impact, get_governance_flags, run).
Calls POST /ai/mcp/tools/call; results are access-filtered when user context is present.
"""

import json
from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

MCP_TOOLS_PATH = "/ai/mcp/tools/call"


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


class DiscoveryApi:
    """Sync discovery surface: search (with include_evidence, include_lineage), get_evidence, get_lineage_impact, get_governance_flags, run."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def search(
        self,
        query: str,
        *,
        type: Optional[str] = None,
        domain_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        include_evidence: Optional[bool] = None,
        include_lineage: Optional[bool] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> dict[str, Any]:
        args: dict[str, Any] = {"query": query}
        if type is not None:
            args["type"] = type
        if domain_id is not None:
            args["domain_id"] = domain_id
        if tags is not None:
            args["tags"] = tags
        if include_evidence is not None:
            args["include_evidence"] = include_evidence
        if include_lineage is not None:
            args["include_lineage"] = include_lineage
        if limit is not None:
            args["limit"] = limit
        if offset is not None:
            args["offset"] = offset
        res = self._http.post(MCP_TOOLS_PATH, {"name": "search_catalog", "arguments": args})
        return _parse_tool_response(res)

    def get_evidence(self, data_product_ids: list[str]) -> dict[str, Any]:
        res = self._http.post(
            MCP_TOOLS_PATH,
            {"name": "get_evidence", "arguments": {"data_product_ids": data_product_ids}},
        )
        return _parse_tool_response(res)

    def get_lineage_impact(self, data_product_id: str) -> dict[str, Any]:
        res = self._http.post(
            MCP_TOOLS_PATH,
            {"name": "get_lineage_impact", "arguments": {"data_product_id": data_product_id}},
        )
        return _parse_tool_response(res)

    def get_governance_flags(self, data_product_id: str) -> dict[str, Any]:
        res = self._http.post(
            MCP_TOOLS_PATH,
            {"name": "get_governance_flags", "arguments": {"data_product_id": data_product_id}},
        )
        return _parse_tool_response(res)

    def run(self) -> dict[str, Any]:
        res = self._http.post(MCP_TOOLS_PATH, {"name": "run_discovery", "arguments": {}})
        return _parse_tool_response(res)


class AsyncDiscoveryApi:
    """Async discovery surface: same methods as DiscoveryApi, async."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def search(
        self,
        query: str,
        *,
        type: Optional[str] = None,
        domain_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        include_evidence: Optional[bool] = None,
        include_lineage: Optional[bool] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> dict[str, Any]:
        args: dict[str, Any] = {"query": query}
        if type is not None:
            args["type"] = type
        if domain_id is not None:
            args["domain_id"] = domain_id
        if tags is not None:
            args["tags"] = tags
        if include_evidence is not None:
            args["include_evidence"] = include_evidence
        if include_lineage is not None:
            args["include_lineage"] = include_lineage
        if limit is not None:
            args["limit"] = limit
        if offset is not None:
            args["offset"] = offset
        res = await self._http.post(MCP_TOOLS_PATH, {"name": "search_catalog", "arguments": args})
        return _parse_tool_response(res)

    async def get_evidence(self, data_product_ids: list[str]) -> dict[str, Any]:
        res = await self._http.post(
            MCP_TOOLS_PATH,
            {"name": "get_evidence", "arguments": {"data_product_ids": data_product_ids}},
        )
        return _parse_tool_response(res)

    async def get_lineage_impact(self, data_product_id: str) -> dict[str, Any]:
        res = await self._http.post(
            MCP_TOOLS_PATH,
            {"name": "get_lineage_impact", "arguments": {"data_product_id": data_product_id}},
        )
        return _parse_tool_response(res)

    async def get_governance_flags(self, data_product_id: str) -> dict[str, Any]:
        res = await self._http.post(
            MCP_TOOLS_PATH,
            {"name": "get_governance_flags", "arguments": {"data_product_id": data_product_id}},
        )
        return _parse_tool_response(res)

    async def run(self) -> dict[str, Any]:
        res = await self._http.post(MCP_TOOLS_PATH, {"name": "run_discovery", "arguments": {}})
        return _parse_tool_response(res)
