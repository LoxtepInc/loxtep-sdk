"""
Semantic bundles API (Phase 2).
MCP: import_semantic_bundle → client.meaning.bundles.import_

  POST /semantic-layer/bundles/import

Phase 0 error contract: always surface skipped_count + errors. On HTTP
207/422 (partial import), return the result with partial=True instead of
raising when a parseable body is present.

Note: Python uses ``import_`` (trailing underscore) because ``import`` is a
keyword. Node SDK exposes the same operation as ``.import``.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from .errors import LoxtepError
from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

BUNDLES_IMPORT_PATH = "/semantic-layer/bundles/import"


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _as_record(value: Any) -> Optional[dict[str, Any]]:
    return value if isinstance(value, dict) else None


def normalize_import_result(
    raw: Any,
    *,
    partial: Optional[bool] = None,
    status_code: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    data = _unwrap(raw)
    rec = _as_record(data)
    if not rec:
        return None
    if (
        not isinstance(rec.get("applied_count"), int)
        and not isinstance(rec.get("skipped_count"), int)
        and not isinstance(rec.get("errors"), list)
        and not isinstance(rec.get("applied"), list)
    ):
        nested = _as_record(rec.get("data"))
        if nested:
            return normalize_import_result(nested, partial=partial, status_code=status_code)
        return None
    out: dict[str, Any] = {
        "dry_run": bool(rec.get("dry_run")),
        "applied_count": rec["applied_count"] if isinstance(rec.get("applied_count"), int) else 0,
        "skipped_count": rec["skipped_count"] if isinstance(rec.get("skipped_count"), int) else 0,
        "errors": rec["errors"] if isinstance(rec.get("errors"), list) else [],
        "applied": rec["applied"] if isinstance(rec.get("applied"), list) else [],
    }
    if partial is not None:
        out["partial"] = partial
    if status_code is not None:
        out["status_code"] = status_code
    return out


def _try_result_from_error(err: LoxtepError) -> Optional[dict[str, Any]]:
    status = err.status_code
    if status not in (207, 422):
        return None
    return normalize_import_result(err.details, partial=True, status_code=status)


class BundlesApi:
    """Sync semantic bundles surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def import_(self, input: Mapping[str, Any]) -> dict[str, Any]:
        """Import a semantic bundle (Node: ``bundles.import``)."""
        bundle = input.get("bundle") if isinstance(input, Mapping) else None
        if not bundle:
            raise ValueError("bundle is required")
        body = {"bundle": bundle, "dry_run": input.get("dry_run", False)}
        try:
            res = self._http.post(BUNDLES_IMPORT_PATH, body)
            normalized = normalize_import_result(res)
            if normalized is None:
                raise ValueError("Unexpected semantic bundle import response shape")
            if normalized["skipped_count"] > 0 or normalized["errors"]:
                return {**normalized, "partial": True}
            return normalized
        except LoxtepError as err:
            from_err = _try_result_from_error(err)
            if from_err is not None:
                return from_err
            raise


class AsyncBundlesApi:
    """Async semantic bundles surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def import_(self, input: Mapping[str, Any]) -> dict[str, Any]:
        """Import a semantic bundle (Node: ``bundles.import``)."""
        bundle = input.get("bundle") if isinstance(input, Mapping) else None
        if not bundle:
            raise ValueError("bundle is required")
        body = {"bundle": bundle, "dry_run": input.get("dry_run", False)}
        try:
            res = await self._http.post(BUNDLES_IMPORT_PATH, body)
            normalized = normalize_import_result(res)
            if normalized is None:
                raise ValueError("Unexpected semantic bundle import response shape")
            if normalized["skipped_count"] > 0 or normalized["errors"]:
                return {**normalized, "partial": True}
            return normalized
        except LoxtepError as err:
            from_err = _try_result_from_error(err)
            if from_err is not None:
                return from_err
            raise
