"""
Semantic proposals API (Phase 2).
Agent review queue parity with Meaning UI.

  GET /semantic-layer/semantic-proposals
  PUT /semantic-layer/semantic-proposals/{semantic_proposal_id}

Batch accept/reject fan out to the single-id PUT (no dedicated batch REST yet).
"""

from __future__ import annotations

from typing import Any, Mapping, Optional, Sequence
from urllib.parse import quote, urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

PROPOSALS_BASE = "/semantic-layer/semantic-proposals"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _as_record(value: Any) -> Optional[dict[str, Any]]:
    return value if isinstance(value, dict) else None


def _default_pagination(total: int) -> dict[str, Any]:
    return {
        "page": 1,
        "page_size": total,
        "total": total,
        "total_pages": 1,
        "has_next": False,
        "has_prev": False,
    }


def _normalize_list(res: Any) -> dict[str, Any]:
    data = _unwrap(res)
    if isinstance(data, list):
        return {"items": data, "pagination": _default_pagination(len(data))}
    rec = _as_record(data)
    if not rec:
        return {"items": [], "pagination": _default_pagination(0)}
    if isinstance(rec.get("items"), list):
        items = rec["items"]
    elif isinstance(rec.get("proposals"), list):
        items = rec["proposals"]
    else:
        items = []
    pagination_raw = _as_record(rec.get("pagination")) or {}
    page = pagination_raw.get("page") if isinstance(pagination_raw.get("page"), int) else 1
    page_size = (
        pagination_raw.get("page_size")
        if isinstance(pagination_raw.get("page_size"), int)
        else len(items)
    )
    total = (
        pagination_raw.get("total") if isinstance(pagination_raw.get("total"), int) else len(items)
    )
    total_pages = (
        pagination_raw.get("total_pages")
        if isinstance(pagination_raw.get("total_pages"), int)
        else max(1, (total + max(page_size, 1) - 1) // max(page_size, 1))
    )
    has_next = (
        pagination_raw["has_next"]
        if isinstance(pagination_raw.get("has_next"), bool)
        else page < total_pages
    )
    has_prev = (
        pagination_raw["has_prev"] if isinstance(pagination_raw.get("has_prev"), bool) else page > 1
    )
    return {
        "items": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_next": has_next,
            "has_prev": has_prev,
        },
    }


def _resolve_body(disposition: str, resolution_note: Optional[str]) -> dict[str, Any]:
    body: dict[str, Any] = {"disposition": disposition}
    if resolution_note is not None:
        body["resolution_note"] = resolution_note
    return body


class ProposalsApi:
    """Sync semantic proposals surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        proposal_type: Optional[str] = None,
        disposition: Optional[str] = None,
        data_product_id: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, str] = {}
        if page is not None:
            params["page"] = str(page)
        if page_size is not None:
            params["page_size"] = str(page_size)
        if proposal_type:
            params["proposal_type"] = proposal_type
        if disposition:
            params["disposition"] = disposition
        if data_product_id:
            params["data_product_id"] = data_product_id
        qs = f"?{urlencode(params)}" if params else ""
        return _normalize_list(self._http.get(f"{PROPOSALS_BASE}{qs}"))

    def accept(
        self,
        semantic_proposal_id: str,
        *,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        if not semantic_proposal_id:
            raise ValueError("semantic_proposal_id is required")
        res = self._http.put(
            f"{PROPOSALS_BASE}/{quote(semantic_proposal_id)}",
            _resolve_body("accepted", resolution_note),
        )
        return _unwrap(res)

    def reject(
        self,
        semantic_proposal_id: str,
        *,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        if not semantic_proposal_id:
            raise ValueError("semantic_proposal_id is required")
        res = self._http.put(
            f"{PROPOSALS_BASE}/{quote(semantic_proposal_id)}",
            _resolve_body("rejected", resolution_note),
        )
        return _unwrap(res)

    def _resolve_batch(
        self,
        *,
        semantic_proposal_ids: Sequence[str],
        disposition: str,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        results: list[dict[str, Any]] = []
        succeeded = 0
        failed = 0
        for semantic_proposal_id in semantic_proposal_ids:
            try:
                one = _unwrap(
                    self._http.put(
                        f"{PROPOSALS_BASE}/{quote(semantic_proposal_id)}",
                        _resolve_body(disposition, resolution_note),
                    )
                )
                results.append(
                    {
                        "semantic_proposal_id": one.get("semantic_proposal_id", semantic_proposal_id)
                        if isinstance(one, dict)
                        else semantic_proposal_id,
                        "disposition": one.get("disposition", disposition)
                        if isinstance(one, dict)
                        else disposition,
                        "ok": True,
                    }
                )
                succeeded += 1
            except Exception as err:  # noqa: BLE001 — batch isolation
                failed += 1
                results.append(
                    {
                        "semantic_proposal_id": semantic_proposal_id,
                        "ok": False,
                        "error": str(err),
                    }
                )
        return {"results": results, "succeeded": succeeded, "failed": failed}

    def accept_batch(
        self,
        input: Mapping[str, Any] | None = None,
        /,
        *,
        semantic_proposal_ids: Optional[Sequence[str]] = None,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        payload = dict(input or {})
        ids = list(semantic_proposal_ids or payload.get("semantic_proposal_ids") or [])
        note = resolution_note if resolution_note is not None else payload.get("resolution_note")
        return self._resolve_batch(
            semantic_proposal_ids=ids,
            disposition="accepted",
            resolution_note=note,
        )

    def reject_batch(
        self,
        input: Mapping[str, Any] | None = None,
        /,
        *,
        semantic_proposal_ids: Optional[Sequence[str]] = None,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        payload = dict(input or {})
        ids = list(semantic_proposal_ids or payload.get("semantic_proposal_ids") or [])
        note = resolution_note if resolution_note is not None else payload.get("resolution_note")
        return self._resolve_batch(
            semantic_proposal_ids=ids,
            disposition="rejected",
            resolution_note=note,
        )


class AsyncProposalsApi:
    """Async semantic proposals surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        proposal_type: Optional[str] = None,
        disposition: Optional[str] = None,
        data_product_id: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, str] = {}
        if page is not None:
            params["page"] = str(page)
        if page_size is not None:
            params["page_size"] = str(page_size)
        if proposal_type:
            params["proposal_type"] = proposal_type
        if disposition:
            params["disposition"] = disposition
        if data_product_id:
            params["data_product_id"] = data_product_id
        qs = f"?{urlencode(params)}" if params else ""
        return _normalize_list(await self._http.get(f"{PROPOSALS_BASE}{qs}"))

    async def accept(
        self,
        semantic_proposal_id: str,
        *,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        if not semantic_proposal_id:
            raise ValueError("semantic_proposal_id is required")
        res = await self._http.put(
            f"{PROPOSALS_BASE}/{quote(semantic_proposal_id)}",
            _resolve_body("accepted", resolution_note),
        )
        return _unwrap(res)

    async def reject(
        self,
        semantic_proposal_id: str,
        *,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        if not semantic_proposal_id:
            raise ValueError("semantic_proposal_id is required")
        res = await self._http.put(
            f"{PROPOSALS_BASE}/{quote(semantic_proposal_id)}",
            _resolve_body("rejected", resolution_note),
        )
        return _unwrap(res)

    async def _resolve_batch(
        self,
        *,
        semantic_proposal_ids: Sequence[str],
        disposition: str,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        results: list[dict[str, Any]] = []
        succeeded = 0
        failed = 0
        for semantic_proposal_id in semantic_proposal_ids:
            try:
                one = _unwrap(
                    await self._http.put(
                        f"{PROPOSALS_BASE}/{quote(semantic_proposal_id)}",
                        _resolve_body(disposition, resolution_note),
                    )
                )
                results.append(
                    {
                        "semantic_proposal_id": one.get("semantic_proposal_id", semantic_proposal_id)
                        if isinstance(one, dict)
                        else semantic_proposal_id,
                        "disposition": one.get("disposition", disposition)
                        if isinstance(one, dict)
                        else disposition,
                        "ok": True,
                    }
                )
                succeeded += 1
            except Exception as err:  # noqa: BLE001 — batch isolation
                failed += 1
                results.append(
                    {
                        "semantic_proposal_id": semantic_proposal_id,
                        "ok": False,
                        "error": str(err),
                    }
                )
        return {"results": results, "succeeded": succeeded, "failed": failed}

    async def accept_batch(
        self,
        input: Mapping[str, Any] | None = None,
        /,
        *,
        semantic_proposal_ids: Optional[Sequence[str]] = None,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        payload = dict(input or {})
        ids = list(semantic_proposal_ids or payload.get("semantic_proposal_ids") or [])
        note = resolution_note if resolution_note is not None else payload.get("resolution_note")
        return await self._resolve_batch(
            semantic_proposal_ids=ids,
            disposition="accepted",
            resolution_note=note,
        )

    async def reject_batch(
        self,
        input: Mapping[str, Any] | None = None,
        /,
        *,
        semantic_proposal_ids: Optional[Sequence[str]] = None,
        resolution_note: Optional[str] = None,
    ) -> dict[str, Any]:
        payload = dict(input or {})
        ids = list(semantic_proposal_ids or payload.get("semantic_proposal_ids") or [])
        note = resolution_note if resolution_note is not None else payload.get("resolution_note")
        return await self._resolve_batch(
            semantic_proposal_ids=ids,
            disposition="rejected",
            resolution_note=note,
        )
