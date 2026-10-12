"""Entity projection inference.

POST /entities/entities/{entity_definition_id}/projections/infer
Body omits the id. ``linked_data_product_ids`` is omitted when absent.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _path(entity_definition_id: str) -> str:
    encoded = quote(entity_definition_id, safe="")
    return f"/entities/entities/{encoded}/projections/infer"


def _payload(body: Optional[Mapping[str, Any]]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if body and body.get("linked_data_product_ids") is not None:
        payload["linked_data_product_ids"] = body["linked_data_product_ids"]
    return payload


class EntitiesApi:
    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def infer_projection(
        self, entity_definition_id: str, body: Optional[Mapping[str, Any]] = None
    ) -> Any:
        if not entity_definition_id:
            raise ValueError("entity_definition_id is required")
        return _unwrap(self._http.post(_path(entity_definition_id), _payload(body)))


class AsyncEntitiesApi:
    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def infer_projection(
        self, entity_definition_id: str, body: Optional[Mapping[str, Any]] = None
    ) -> Any:
        if not entity_definition_id:
            raise ValueError("entity_definition_id is required")
        return _unwrap(await self._http.post(_path(entity_definition_id), _payload(body)))
