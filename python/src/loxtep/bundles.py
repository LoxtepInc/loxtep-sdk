"""
Semantic bundles API (Phase 2 + package stage cutover).
MCP: import_semantic_bundle → client.meaning.bundles.import_
MCP: export_semantic_bundle → client.meaning.bundles.export_

  POST /semantic-layer/bundles/import
  GET  /semantic-layer/bundles/export

Note: Python uses ``import_`` / ``export_`` because ``import``/``export`` are
keywords or reserved. Node SDK exposes ``.import`` / ``.export``.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional
from urllib.parse import urlencode

from .errors import LoxtepError
from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

BUNDLES_IMPORT_PATH = "/semantic-layer/bundles/import"
BUNDLES_EXPORT_PATH = "/semantic-layer/bundles/export"


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
        and not isinstance(rec.get("package"), dict)
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
        "loss_report": rec["loss_report"] if isinstance(rec.get("loss_report"), list) else [],
    }
    if rec.get("activation") in ("stage", "deploy"):
        out["activation"] = rec["activation"]
    if isinstance(rec.get("package"), dict):
        out["package"] = rec["package"]
    if isinstance(rec.get("plan"), dict):
        out["plan"] = rec["plan"]
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
        body: dict[str, Any] = {"bundle": bundle, "dry_run": input.get("dry_run", False)}
        if input.get("activation"):
            body["activation"] = input["activation"]
        if input.get("package_id"):
            body["package_id"] = input["package_id"]
        if input.get("package_label"):
            body["package_label"] = input["package_label"]
        try:
            res = self._http.post(BUNDLES_IMPORT_PATH, body)
            normalized = normalize_import_result(res)
            if normalized is None:
                raise ValueError("Unexpected semantic bundle import response shape")
            if (
                normalized.get("dry_run")
                or normalized.get("activation") == "stage"
                or normalized.get("package")
            ):
                return normalized
            has_loss = bool(normalized.get("loss_report"))
            if normalized["skipped_count"] > 0 or normalized["errors"] or has_loss:
                return {**normalized, "partial": True}
            return normalized
        except LoxtepError as err:
            from_err = _try_result_from_error(err)
            if from_err is not None:
                return from_err
            raise

    def export_(self, query: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        """Export a semantic bundle (Node: ``bundles.export``)."""
        qs = urlencode({k: str(v) for k, v in dict(query or {}).items() if v is not None})
        path = f"{BUNDLES_EXPORT_PATH}?{qs}" if qs else BUNDLES_EXPORT_PATH
        return _unwrap(self._http.get(path))


class AsyncBundlesApi:
    """Async semantic bundles surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def import_(self, input: Mapping[str, Any]) -> dict[str, Any]:
        """Import a semantic bundle (Node: ``bundles.import``)."""
        bundle = input.get("bundle") if isinstance(input, Mapping) else None
        if not bundle:
            raise ValueError("bundle is required")
        body: dict[str, Any] = {"bundle": bundle, "dry_run": input.get("dry_run", False)}
        if input.get("activation"):
            body["activation"] = input["activation"]
        if input.get("package_id"):
            body["package_id"] = input["package_id"]
        if input.get("package_label"):
            body["package_label"] = input["package_label"]
        try:
            res = await self._http.post(BUNDLES_IMPORT_PATH, body)
            normalized = normalize_import_result(res)
            if normalized is None:
                raise ValueError("Unexpected semantic bundle import response shape")
            if (
                normalized.get("dry_run")
                or normalized.get("activation") == "stage"
                or normalized.get("package")
            ):
                return normalized
            has_loss = bool(normalized.get("loss_report"))
            if normalized["skipped_count"] > 0 or normalized["errors"] or has_loss:
                return {**normalized, "partial": True}
            return normalized
        except LoxtepError as err:
            from_err = _try_result_from_error(err)
            if from_err is not None:
                return from_err
            raise

    async def export_(self, query: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        """Export a semantic bundle (Node: ``bundles.export``)."""
        qs = urlencode({k: str(v) for k, v in dict(query or {}).items() if v is not None})
        path = f"{BUNDLES_EXPORT_PATH}?{qs}" if qs else BUNDLES_EXPORT_PATH
        return _unwrap(await self._http.get(path))
