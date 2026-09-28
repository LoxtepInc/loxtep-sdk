"""
Domain shapes API (Phase 2) — org canonical schemas under semantic-layer.
Distinct from ``client.define.schemas`` (data-product schema versions).

MCP: create_schema / list_schemas / get_schema / apply_schema / patch_schema
(align = patch with aligned_to_concept_uri).

  POST /semantic-layer/schemas
  GET  /semantic-layer/schemas
  GET  /semantic-layer/schemas/{schema_id}
  PUT  /semantic-layer/schemas/{schema_id}
  POST /semantic-layer/schemas/{schema_id}/applications
"""

from __future__ import annotations

from typing import Any, Mapping, Optional
from urllib.parse import quote, urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

SHAPES_BASE = "/semantic-layer/schemas"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _as_record(value: Any) -> Optional[dict[str, Any]]:
    return value if isinstance(value, dict) else None


def _normalize_list(res: Any) -> dict[str, Any]:
    data = _unwrap(res)
    if isinstance(data, list):
        return {"shapes": data, "total": len(data)}
    rec = _as_record(data)
    if not rec:
        return {"shapes": [], "total": 0}
    if isinstance(rec.get("items"), list):
        items = rec["items"]
    elif isinstance(rec.get("schemas"), list):
        items = rec["schemas"]
    elif isinstance(rec.get("shapes"), list):
        items = rec["shapes"]
    else:
        items = []
    pagination = _as_record(rec.get("pagination")) or {}
    total = pagination.get("total") if isinstance(pagination.get("total"), int) else None
    if total is None:
        total = rec.get("total") if isinstance(rec.get("total"), int) else len(items)
    return {"shapes": items, "total": total}


def _normalize_detail(res: Any) -> dict[str, Any]:
    data = _unwrap(res)
    rec = _as_record(data) or {}
    schema = rec.get("schema") if isinstance(rec.get("schema"), dict) else rec
    versions = rec.get("versions") if isinstance(rec.get("versions"), list) else []
    return {"schema": schema, "versions": versions}


class ShapesApi:
    """Sync domain shapes surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def create(self, input: Mapping[str, Any]) -> dict[str, Any]:
        if not input.get("name"):
            raise ValueError("name is required")
        if not input.get("format"):
            raise ValueError("format is required")
        body: dict[str, Any] = {
            "name": input["name"],
            "version": input.get("version", "1.0.0"),
            "format": input["format"],
            "definition": input.get("definition") if input.get("definition") is not None else {},
            "fields": list(input.get("fields") or []),
            "domain_id": input.get("domain_id"),
            "canonical_key": input.get("canonical_key"),
            "description": input.get("description"),
            "metadata": input.get("metadata"),
            "lifecycle_state": input.get("lifecycle_state"),
            "change_propagation_policy": input.get("change_propagation_policy"),
            "aligned_to_concept_uri": input.get("aligned_to_concept_uri"),
        }
        return _unwrap(self._http.post(SHAPES_BASE, body))

    def list(
        self,
        *,
        domain_id: Optional[str] = None,
        domain: Optional[str] = None,
        format: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, str] = {}
        domain_value = domain_id or domain
        if domain_value:
            params["domain"] = domain_value
        if format:
            params["format"] = format
        if search:
            params["search"] = search
        qs = f"?{urlencode(params)}" if params else ""
        return _normalize_list(self._http.get(f"{SHAPES_BASE}{qs}"))

    def get(self, schema_id: str) -> dict[str, Any]:
        if not schema_id:
            raise ValueError("schema_id is required")
        return _normalize_detail(self._http.get(f"{SHAPES_BASE}/{quote(schema_id)}"))

    def apply(self, input: Mapping[str, Any]) -> dict[str, Any]:
        schema_id = input.get("schema_id")
        data_product_id = input.get("data_product_id")
        if not schema_id:
            raise ValueError("schema_id is required")
        if not data_product_id:
            raise ValueError("data_product_id is required")
        body: dict[str, Any] = {"data_product_id": data_product_id}
        if input.get("schema_version_id") is not None:
            body["schema_version_id"] = input["schema_version_id"]
        return _unwrap(
            self._http.post(f"{SHAPES_BASE}/{quote(str(schema_id))}/applications", body)
        )

    def align(self, input: Mapping[str, Any]) -> dict[str, Any]:
        schema_id = input.get("schema_id")
        if not schema_id:
            raise ValueError("schema_id is required")
        body = {"aligned_to_concept_uri": input.get("aligned_to_concept_uri")}
        return _unwrap(self._http.put(f"{SHAPES_BASE}/{quote(str(schema_id))}", body))


class AsyncShapesApi:
    """Async domain shapes surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def create(self, input: Mapping[str, Any]) -> dict[str, Any]:
        if not input.get("name"):
            raise ValueError("name is required")
        if not input.get("format"):
            raise ValueError("format is required")
        body: dict[str, Any] = {
            "name": input["name"],
            "version": input.get("version", "1.0.0"),
            "format": input["format"],
            "definition": input.get("definition") if input.get("definition") is not None else {},
            "fields": list(input.get("fields") or []),
            "domain_id": input.get("domain_id"),
            "canonical_key": input.get("canonical_key"),
            "description": input.get("description"),
            "metadata": input.get("metadata"),
            "lifecycle_state": input.get("lifecycle_state"),
            "change_propagation_policy": input.get("change_propagation_policy"),
            "aligned_to_concept_uri": input.get("aligned_to_concept_uri"),
        }
        return _unwrap(await self._http.post(SHAPES_BASE, body))

    async def list(
        self,
        *,
        domain_id: Optional[str] = None,
        domain: Optional[str] = None,
        format: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, str] = {}
        domain_value = domain_id or domain
        if domain_value:
            params["domain"] = domain_value
        if format:
            params["format"] = format
        if search:
            params["search"] = search
        qs = f"?{urlencode(params)}" if params else ""
        return _normalize_list(await self._http.get(f"{SHAPES_BASE}{qs}"))

    async def get(self, schema_id: str) -> dict[str, Any]:
        if not schema_id:
            raise ValueError("schema_id is required")
        return _normalize_detail(await self._http.get(f"{SHAPES_BASE}/{quote(schema_id)}"))

    async def apply(self, input: Mapping[str, Any]) -> dict[str, Any]:
        schema_id = input.get("schema_id")
        data_product_id = input.get("data_product_id")
        if not schema_id:
            raise ValueError("schema_id is required")
        if not data_product_id:
            raise ValueError("data_product_id is required")
        body: dict[str, Any] = {"data_product_id": data_product_id}
        if input.get("schema_version_id") is not None:
            body["schema_version_id"] = input["schema_version_id"]
        return _unwrap(
            await self._http.post(f"{SHAPES_BASE}/{quote(str(schema_id))}/applications", body)
        )

    async def align(self, input: Mapping[str, Any]) -> dict[str, Any]:
        schema_id = input.get("schema_id")
        if not schema_id:
            raise ValueError("schema_id is required")
        body = {"aligned_to_concept_uri": input.get("aligned_to_concept_uri")}
        return _unwrap(await self._http.put(f"{SHAPES_BASE}/{quote(str(schema_id))}", body))
