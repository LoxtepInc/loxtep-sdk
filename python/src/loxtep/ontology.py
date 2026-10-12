"""Ontology relationship discovery and accept.

POST /graph/relationships/discover — omit ``limit`` when absent.
POST /graph/relationships/accept — omit ``data_product_id`` when absent.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _discover_body(payload: Optional[Mapping[str, Any]]) -> dict[str, Any]:
    body: dict[str, Any] = {}
    if payload and payload.get("limit") is not None:
        body["limit"] = payload["limit"]
    return body


def _accept_body(payload: Mapping[str, Any]) -> dict[str, Any]:
    body: dict[str, Any] = {"relationships": payload.get("relationships") or []}
    if payload.get("data_product_id") is not None:
        body["data_product_id"] = payload["data_product_id"]
    return body


class OntologyApi:
    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def discover_ontology_relationships(self, payload: Optional[Mapping[str, Any]] = None) -> Any:
        return _unwrap(self._http.post("/graph/relationships/discover", _discover_body(payload)))

    def accept_ontology_relationships(self, payload: Mapping[str, Any]) -> Any:
        return _unwrap(self._http.post("/graph/relationships/accept", _accept_body(payload)))


class AsyncOntologyApi:
    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def discover_ontology_relationships(
        self, payload: Optional[Mapping[str, Any]] = None
    ) -> Any:
        return _unwrap(
            await self._http.post("/graph/relationships/discover", _discover_body(payload))
        )

    async def accept_ontology_relationships(self, payload: Mapping[str, Any]) -> Any:
        return _unwrap(await self._http.post("/graph/relationships/accept", _accept_body(payload)))
