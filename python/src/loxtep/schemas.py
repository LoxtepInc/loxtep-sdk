"""
Schemas API (data product schema). get, list, tag_pii_fields.
"""

from __future__ import annotations

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


class SchemasApi:
    """Sync schemas surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def get(self, data_product_id: str, *, version: Optional[str] = None) -> dict[str, Any]:
        path = f"/dataproducts/{data_product_id}/schema"
        if version is not None:
            path += f"?version={version}"
        res = self._http.get(path)
        return _unwrap(res)

    def list(self, data_product_id: str) -> dict[str, Any]:
        """List schema versions for a data product. Returns {'items': [...]}."""
        res = self._http.get(f"/dataproducts/{data_product_id}?include_schema=true")
        data = _unwrap(res)
        schema = data.get("schema") if isinstance(data, dict) else None
        items = schema.get("versions", []) if isinstance(schema, dict) else []
        return {"items": items}

    def tag_pii_fields(self, data_product_id: str, fields: list[str]) -> Any:
        """Tag fields as PII on a data product's schema."""
        res = self._http.post(f"/schemas/{data_product_id}/pii", {"fields": fields})
        return _unwrap(res)


class AsyncSchemasApi:
    """Async schemas surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def get(self, data_product_id: str, *, version: Optional[str] = None) -> dict[str, Any]:
        path = f"/dataproducts/{data_product_id}/schema"
        if version is not None:
            path += f"?version={version}"
        res = await self._http.get(path)
        return _unwrap(res)

    async def list(self, data_product_id: str) -> dict[str, Any]:
        res = await self._http.get(f"/dataproducts/{data_product_id}?include_schema=true")
        data = _unwrap(res)
        schema = data.get("schema") if isinstance(data, dict) else None
        items = schema.get("versions", []) if isinstance(schema, dict) else []
        return {"items": items}

    async def tag_pii_fields(self, data_product_id: str, fields: list[str]) -> Any:
        res = await self._http.post(f"/schemas/{data_product_id}/pii", {"fields": fields})
        return _unwrap(res)
