"""Product definition API (MCP: loxtep_define definition ops).

Prefer thin REST where it exists:
  GET  /semantic-layer/product-definition?data_product_id=
  POST /semantic-layer/product-definition { action, semantic_proposal_id }

Remaining ops call POST /ai/mcp/tools/call with facade name ``loxtep_define``.
"""

from __future__ import annotations

import json
from typing import Any, Optional
from urllib.parse import urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

REST_BASE = "/semantic-layer/product-definition"
MCP_TOOLS_PATH = "/ai/mcp/tools/call"


def _unwrap_data(res: Any) -> Any:
    if isinstance(res, dict) and "data" in res:
        return res["data"]
    return res


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
        err = parsed.get("error") or "Definition operation failed"
        raise RuntimeError(str(err))
    if isinstance(parsed, dict) and "data" in parsed:
        return parsed["data"]
    return parsed


class ProductDefinitionApi:
    """Sync product-definition surface under ``client.define.product_definition``."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def _call_define(self, operation: str, args: Optional[dict[str, Any]] = None) -> Any:
        body = {"name": "loxtep_define", "arguments": {"operation": operation, **(args or {})}}
        res = self._http.post(MCP_TOOLS_PATH, body)
        return _unwrap_tool_payload(_parse_tool_response(res))

    def _post_action(self, action: str, semantic_proposal_id: str) -> Any:
        if not semantic_proposal_id:
            raise ValueError("semantic_proposal_id is required")
        res = self._http.post(
            REST_BASE, {"action": action, "semantic_proposal_id": semantic_proposal_id}
        )
        return _unwrap_data(res)

    def get_definition_evidence(self, data_product_id: str) -> Any:
        if not data_product_id:
            raise ValueError("data_product_id is required")
        return self._call_define("get_definition_evidence", {"data_product_id": data_product_id})

    def submit_shape_proposal(self, **input: Any) -> Any:
        if not input.get("data_product_id"):
            raise ValueError("data_product_id is required")
        if input.get("proposed_definition") is None:
            raise ValueError("proposed_definition is required")
        return self._call_define("submit_shape_proposal", input)

    def revise_shape_proposal(self, **input: Any) -> Any:
        if not input.get("semantic_proposal_id"):
            raise ValueError("semantic_proposal_id is required")
        return self._call_define("revise_shape_proposal", input)

    def revise_semantic_bindings_proposal(self, **input: Any) -> Any:
        if not input.get("semantic_proposal_id"):
            raise ValueError("semantic_proposal_id is required")
        return self._call_define("revise_semantic_bindings_proposal", input)

    def get_definition_proposal(self, semantic_proposal_id: str) -> Any:
        if not semantic_proposal_id:
            raise ValueError("semantic_proposal_id is required")
        return self._call_define(
            "get_definition_proposal", {"semantic_proposal_id": semantic_proposal_id}
        )

    def list_definition_proposals(self, **filters: Any) -> Any:
        args = {k: v for k, v in filters.items() if v is not None}
        return self._call_define("list_definition_proposals", args)

    def withdraw_definition_proposal(self, semantic_proposal_id: str) -> Any:
        return self._post_action("withdraw", semantic_proposal_id)

    def submit_semantic_bindings_proposal(self, **input: Any) -> Any:
        if not input.get("data_product_id"):
            raise ValueError("data_product_id is required")
        return self._call_define("submit_semantic_bindings_proposal", input)

    def approve_definition_proposal(self, semantic_proposal_id: str) -> Any:
        return self._post_action("approve", semantic_proposal_id)

    def apply_definition_proposal(self, semantic_proposal_id: str) -> Any:
        return self._post_action("apply", semantic_proposal_id)

    def get_definition_status(self, data_product_id: str) -> Any:
        if not data_product_id:
            raise ValueError("data_product_id is required")
        qs = urlencode({"data_product_id": data_product_id})
        res = self._http.get(f"{REST_BASE}?{qs}")
        return _unwrap_data(res)

    def run_definition_batch(
        self, data_product_ids: list[str], *, action: str = "status"
    ) -> Any:
        if not data_product_ids:
            raise ValueError("data_product_ids is required")
        return self._call_define(
            "run_definition_batch",
            {"data_product_ids": data_product_ids, "action": action},
        )

    def get_definition_skill(self) -> Any:
        return self._call_define("get_definition_skill", {})

    def start_definition_procedure_run(self, data_product_id: str) -> Any:
        if not data_product_id:
            raise ValueError("data_product_id is required")
        return self._call_define(
            "start_definition_procedure_run", {"data_product_id": data_product_id}
        )


class AsyncProductDefinitionApi:
    """Async product-definition surface under ``client.define.product_definition``."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def _call_define(self, operation: str, args: Optional[dict[str, Any]] = None) -> Any:
        body = {"name": "loxtep_define", "arguments": {"operation": operation, **(args or {})}}
        res = await self._http.post(MCP_TOOLS_PATH, body)
        return _unwrap_tool_payload(_parse_tool_response(res))

    async def _post_action(self, action: str, semantic_proposal_id: str) -> Any:
        if not semantic_proposal_id:
            raise ValueError("semantic_proposal_id is required")
        res = await self._http.post(
            REST_BASE, {"action": action, "semantic_proposal_id": semantic_proposal_id}
        )
        return _unwrap_data(res)

    async def get_definition_evidence(self, data_product_id: str) -> Any:
        if not data_product_id:
            raise ValueError("data_product_id is required")
        return await self._call_define(
            "get_definition_evidence", {"data_product_id": data_product_id}
        )

    async def submit_shape_proposal(self, **input: Any) -> Any:
        if not input.get("data_product_id"):
            raise ValueError("data_product_id is required")
        if input.get("proposed_definition") is None:
            raise ValueError("proposed_definition is required")
        return await self._call_define("submit_shape_proposal", input)

    async def revise_shape_proposal(self, **input: Any) -> Any:
        if not input.get("semantic_proposal_id"):
            raise ValueError("semantic_proposal_id is required")
        return await self._call_define("revise_shape_proposal", input)

    async def revise_semantic_bindings_proposal(self, **input: Any) -> Any:
        if not input.get("semantic_proposal_id"):
            raise ValueError("semantic_proposal_id is required")
        return await self._call_define("revise_semantic_bindings_proposal", input)

    async def get_definition_proposal(self, semantic_proposal_id: str) -> Any:
        if not semantic_proposal_id:
            raise ValueError("semantic_proposal_id is required")
        return await self._call_define(
            "get_definition_proposal", {"semantic_proposal_id": semantic_proposal_id}
        )

    async def list_definition_proposals(self, **filters: Any) -> Any:
        args = {k: v for k, v in filters.items() if v is not None}
        return await self._call_define("list_definition_proposals", args)

    async def withdraw_definition_proposal(self, semantic_proposal_id: str) -> Any:
        return await self._post_action("withdraw", semantic_proposal_id)

    async def submit_semantic_bindings_proposal(self, **input: Any) -> Any:
        if not input.get("data_product_id"):
            raise ValueError("data_product_id is required")
        return await self._call_define("submit_semantic_bindings_proposal", input)

    async def approve_definition_proposal(self, semantic_proposal_id: str) -> Any:
        return await self._post_action("approve", semantic_proposal_id)

    async def apply_definition_proposal(self, semantic_proposal_id: str) -> Any:
        return await self._post_action("apply", semantic_proposal_id)

    async def get_definition_status(self, data_product_id: str) -> Any:
        if not data_product_id:
            raise ValueError("data_product_id is required")
        qs = urlencode({"data_product_id": data_product_id})
        res = await self._http.get(f"{REST_BASE}?{qs}")
        return _unwrap_data(res)

    async def run_definition_batch(
        self, data_product_ids: list[str], *, action: str = "status"
    ) -> Any:
        if not data_product_ids:
            raise ValueError("data_product_ids is required")
        return await self._call_define(
            "run_definition_batch",
            {"data_product_ids": data_product_ids, "action": action},
        )

    async def get_definition_skill(self) -> Any:
        return await self._call_define("get_definition_skill", {})

    async def start_definition_procedure_run(self, data_product_id: str) -> Any:
        if not data_product_id:
            raise ValueError("data_product_id is required")
        return await self._call_define(
            "start_definition_procedure_run", {"data_product_id": data_product_id}
        )
