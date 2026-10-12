"""CDLC HTTP API. Attached as ``client.review.cdlc`` (Node parity).

``bridge_semantics`` posts ``/graph/cdlc/bridge-semantics`` (not org-scoped).
``list_cdlc_review_queue`` is an alias of ``list_review_queue``.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional
from urllib.parse import quote, urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _query(params: Mapping[str, Any]) -> str:
    clean = {key: str(value) for key, value in params.items() if value is not None and value != ""}
    return "?" + urlencode(clean) if clean else ""


def _require_org(stored: Optional[str], override: Optional[str]) -> str:
    org = override or stored
    if not org:
        raise ValueError(
            "organization_id is required for CDLC calls "
            "(set it on the client or pass it explicitly)"
        )
    return org


def _org_base(org: str) -> str:
    return f"/graph/organizations/{quote(org, safe='')}/cdlc"


def _as_list(payload: Any, *keys: str) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


def _counted(payload: Any, key: str, rows: list[Any]) -> dict[str, Any]:
    count = len(rows)
    if isinstance(payload, dict) and isinstance(payload.get("count"), int):
        count = payload["count"]
    return {key: rows, "count": count}


def _omit(body: Mapping[str, Any], drop: set[str]) -> dict[str, Any]:
    return {key: value for key, value in body.items() if key not in drop and value is not None}


class CdlcApi:
    """Sync CDLC surface."""

    def __init__(self, http: LoxtepHttpClient, *, organization_id: Optional[str] = None) -> None:
        self._http = http
        self._organization_id = organization_id

    def _org(self, override: Optional[str] = None) -> str:
        return _require_org(self._organization_id, override)

    def get_artifact_lifecycle(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        org = self._org(payload.get("organization_id"))
        ref = str(payload["artifact_ref"])
        data = _unwrap(self._http.get(f"{_org_base(org)}/artifacts/{quote(ref, safe='')}"))
        row = data if isinstance(data, dict) else {}
        return {
            "artifact_ref": row.get("artifact_ref", ref),
            "lifecycle_state": row.get("lifecycle_state", "deployed"),
            "change_propagation_policy": row.get("change_propagation_policy", "queue_review"),
            "owner": row.get("owner"),
            "allowed_transitions": row.get("allowed_transitions") or [],
        }

    def transition_lifecycle(self, payload: Mapping[str, Any]) -> Any:
        org = self._org(payload.get("organization_id"))
        ref = str(payload["artifact_ref"])
        body = _omit(payload, {"organization_id", "artifact_ref"})
        path = f"{_org_base(org)}/artifacts/{quote(ref, safe='')}/transition"
        return _unwrap(self._http.post(path, body))

    def propagate_change(self, payload: Mapping[str, Any]) -> Any:
        org = self._org(payload.get("organization_id"))
        body = {
            "artifact_ref": payload["artifact_ref"],
            "new_version": payload["new_version"],
            "previous_version": payload.get("previous_version"),
            "change_propagation_policy": payload.get("change_propagation_policy"),
        }
        if payload.get("actor"):
            body["actor"] = payload["actor"]
        return _unwrap(self._http.post(f"{_org_base(org)}/propagate", body))

    def list_propagation_lineage(self, filters: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        qs = _query(
            {
                "source_artifact_ref": filters.get("source_artifact_ref"),
                "action_taken": filters.get("action_taken"),
                "actor": filters.get("actor"),
                "from_date": filters.get("from_date"),
                "to_date": filters.get("to_date"),
            }
        )
        data = _unwrap(self._http.get(f"{_org_base(org)}/propagation-lineage{qs}"))
        rows = _as_list(data, "records")
        return _counted(data, "records", rows)

    def list_context_dependencies(self, filters: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        qs = _query(
            {
                "from_artifact_ref": filters.get("from_artifact_ref"),
                "to_artifact_ref": filters.get("to_artifact_ref"),
                "dependency_type": filters.get("dependency_type"),
            }
        )
        data = _unwrap(self._http.get(f"{_org_base(org)}/dependencies{qs}"))
        rows = _as_list(data, "dependencies")
        return _counted(data, "dependencies", rows)

    def list_review_queue(self, filters: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        qs = _query({"domain_id": filters.get("domain_id")})
        data = _unwrap(self._http.get(f"{_org_base(org)}/review-queue{qs}"))
        return _counted(data, "tasks", _as_list(data, "tasks", "items"))

    def list_cdlc_review_queue(self, filters: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        return self.list_review_queue(filters)

    def list_artifacts(self, filters: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        qs = _query(
            {
                "lifecycle_state": filters.get("lifecycle_state"),
                "scope": filters.get("scope"),
                "artifact_type": filters.get("artifact_type"),
                "owner": filters.get("owner"),
                "domain_id": filters.get("domain_id"),
            }
        )
        data = _unwrap(self._http.get(f"{_org_base(org)}/artifacts{qs}"))
        return _counted(data, "artifacts", _as_list(data, "artifacts", "items"))

    def submit_for_review(self, payload: Mapping[str, Any]) -> Any:
        org = self._org(payload.get("organization_id"))
        refs = payload.get("artifact_refs") or []
        if not refs:
            raise ValueError("artifact_refs is required")
        path = f"{_org_base(org)}/artifacts/submit-for-review"
        return _unwrap(self._http.post(path, {"artifact_refs": list(refs)}))

    def list_identity_clusters(self, filters: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        data = _unwrap(self._http.get(f"{_org_base(org)}/identity-clusters"))
        return _counted(data, "clusters", _as_list(data, "clusters", "items"))

    def approve_review(self, payload: Mapping[str, Any]) -> Any:
        task_id = payload.get("task_id")
        if not task_id:
            raise ValueError("task_id is required")
        org = self._org(payload.get("organization_id"))
        path = f"{_org_base(org)}/review-queue/{quote(str(task_id), safe='')}/approve"
        return _unwrap(self._http.post(path, {}))

    def bridge_semantics(self, payload: Mapping[str, Any]) -> Any:
        data_product_id = payload.get("data_product_id")
        if not data_product_id:
            raise ValueError("data_product_id is required")
        return _unwrap(
            self._http.post("/graph/cdlc/bridge-semantics", {"data_product_id": data_product_id})
        )


class AsyncCdlcApi:
    """Async CDLC surface."""

    def __init__(
        self, http: AsyncLoxtepHttpClient, *, organization_id: Optional[str] = None
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    def _org(self, override: Optional[str] = None) -> str:
        return _require_org(self._organization_id, override)

    async def get_artifact_lifecycle(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        org = self._org(payload.get("organization_id"))
        ref = str(payload["artifact_ref"])
        data = _unwrap(await self._http.get(f"{_org_base(org)}/artifacts/{quote(ref, safe='')}"))
        row = data if isinstance(data, dict) else {}
        return {
            "artifact_ref": row.get("artifact_ref", ref),
            "lifecycle_state": row.get("lifecycle_state", "deployed"),
            "change_propagation_policy": row.get("change_propagation_policy", "queue_review"),
            "owner": row.get("owner"),
            "allowed_transitions": row.get("allowed_transitions") or [],
        }

    async def transition_lifecycle(self, payload: Mapping[str, Any]) -> Any:
        org = self._org(payload.get("organization_id"))
        ref = str(payload["artifact_ref"])
        body = _omit(payload, {"organization_id", "artifact_ref"})
        path = f"{_org_base(org)}/artifacts/{quote(ref, safe='')}/transition"
        return _unwrap(await self._http.post(path, body))

    async def propagate_change(self, payload: Mapping[str, Any]) -> Any:
        org = self._org(payload.get("organization_id"))
        body = {
            "artifact_ref": payload["artifact_ref"],
            "new_version": payload["new_version"],
            "previous_version": payload.get("previous_version"),
            "change_propagation_policy": payload.get("change_propagation_policy"),
        }
        if payload.get("actor"):
            body["actor"] = payload["actor"]
        return _unwrap(await self._http.post(f"{_org_base(org)}/propagate", body))

    async def list_propagation_lineage(
        self, filters: Optional[Mapping[str, Any]] = None
    ) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        qs = _query(
            {
                "source_artifact_ref": filters.get("source_artifact_ref"),
                "action_taken": filters.get("action_taken"),
                "actor": filters.get("actor"),
                "from_date": filters.get("from_date"),
                "to_date": filters.get("to_date"),
            }
        )
        data = _unwrap(await self._http.get(f"{_org_base(org)}/propagation-lineage{qs}"))
        return _counted(data, "records", _as_list(data, "records"))

    async def list_context_dependencies(
        self, filters: Optional[Mapping[str, Any]] = None
    ) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        qs = _query(
            {
                "from_artifact_ref": filters.get("from_artifact_ref"),
                "to_artifact_ref": filters.get("to_artifact_ref"),
                "dependency_type": filters.get("dependency_type"),
            }
        )
        data = _unwrap(await self._http.get(f"{_org_base(org)}/dependencies{qs}"))
        return _counted(data, "dependencies", _as_list(data, "dependencies"))

    async def list_review_queue(self, filters: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        qs = _query({"domain_id": filters.get("domain_id")})
        data = _unwrap(await self._http.get(f"{_org_base(org)}/review-queue{qs}"))
        return _counted(data, "tasks", _as_list(data, "tasks", "items"))

    async def list_cdlc_review_queue(
        self, filters: Optional[Mapping[str, Any]] = None
    ) -> dict[str, Any]:
        return await self.list_review_queue(filters)

    async def list_artifacts(self, filters: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        qs = _query(
            {
                "lifecycle_state": filters.get("lifecycle_state"),
                "scope": filters.get("scope"),
                "artifact_type": filters.get("artifact_type"),
                "owner": filters.get("owner"),
                "domain_id": filters.get("domain_id"),
            }
        )
        data = _unwrap(await self._http.get(f"{_org_base(org)}/artifacts{qs}"))
        return _counted(data, "artifacts", _as_list(data, "artifacts", "items"))

    async def submit_for_review(self, payload: Mapping[str, Any]) -> Any:
        org = self._org(payload.get("organization_id"))
        refs = payload.get("artifact_refs") or []
        if not refs:
            raise ValueError("artifact_refs is required")
        path = f"{_org_base(org)}/artifacts/submit-for-review"
        return _unwrap(await self._http.post(path, {"artifact_refs": list(refs)}))

    async def list_identity_clusters(
        self, filters: Optional[Mapping[str, Any]] = None
    ) -> dict[str, Any]:
        filters = filters or {}
        org = self._org(filters.get("organization_id"))
        data = _unwrap(await self._http.get(f"{_org_base(org)}/identity-clusters"))
        return _counted(data, "clusters", _as_list(data, "clusters", "items"))

    async def approve_review(self, payload: Mapping[str, Any]) -> Any:
        task_id = payload.get("task_id")
        if not task_id:
            raise ValueError("task_id is required")
        org = self._org(payload.get("organization_id"))
        path = f"{_org_base(org)}/review-queue/{quote(str(task_id), safe='')}/approve"
        return _unwrap(await self._http.post(path, {}))

    async def bridge_semantics(self, payload: Mapping[str, Any]) -> Any:
        data_product_id = payload.get("data_product_id")
        if not data_product_id:
            raise ValueError("data_product_id is required")
        return _unwrap(
            await self._http.post(
                "/graph/cdlc/bridge-semantics", {"data_product_id": data_product_id}
            )
        )
