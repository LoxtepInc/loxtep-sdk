"""Semantic-layer glossary binding apply.

POST /semantic-layer/glossary/bindings
``mapping_revision`` is omitted when absent.
"""

from __future__ import annotations

from typing import Any, Mapping

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

_PATH = "/semantic-layer/glossary/bindings"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _body(payload: Mapping[str, Any]) -> dict[str, Any]:
    body: dict[str, Any] = {"data_product_id": payload["data_product_id"]}
    if payload.get("mapping_revision") is not None:
        body["mapping_revision"] = payload["mapping_revision"]
    return body


class SemanticLayerApi:
    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def apply_glossary_bindings(self, payload: Mapping[str, Any]) -> Any:
        return _unwrap(self._http.post(_PATH, _body(payload)))


class AsyncSemanticLayerApi:
    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def apply_glossary_bindings(self, payload: Mapping[str, Any]) -> Any:
        return _unwrap(await self._http.post(_PATH, _body(payload)))
