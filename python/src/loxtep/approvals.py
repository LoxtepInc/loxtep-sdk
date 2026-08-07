"""
Approvals API — list pending approval requests and resolve them (approve/reject).
Backend: agent-orchestration approval-requests REST API.

  GET  /agent-orchestration/organizations/{org}/approval-requests?status=pending
  POST /agent-orchestration/organizations/{org}/approval-requests/{id}/approve|reject
"""

from __future__ import annotations

from typing import Any, Optional
from urllib.parse import urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _query_string(params: dict[str, Any]) -> str:
    clean = {k: str(v) for k, v in params.items() if v is not None}
    return "?" + urlencode(clean) if clean else ""


class ApprovalsApi:
    """Sync approvals surface (HITL inbox parity)."""

    unavailable: bool = False

    def __init__(
        self,
        http: LoxtepHttpClient,
        *,
        organization_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    def _resolve_org(self, override: Optional[str] = None) -> str:
        org = override or self._organization_id
        if not org:
            raise ValueError(
                "organization_id is required for approvals calls "
                "(set it on the client or pass it explicitly)"
            )
        return org

    def _base(self, org: str) -> str:
        return f"/agent-orchestration/organizations/{org}/approval-requests"

    def list(
        self,
        *,
        status: Optional[str] = None,
        organization_id: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(organization_id)
        qs = _query_string({"status": status, "page": page, "page_size": page_size})
        payload = _unwrap(self._http.get(f"{self._base(org)}{qs}"))
        if not isinstance(payload, dict):
            return {"items": [], "pagination": None}
        return {
            "items": payload.get("items") or [],
            "pagination": payload.get("pagination"),
        }

    def list_pending(self, organization_id: Optional[str] = None) -> dict[str, Any]:
        return self.list(status="pending", organization_id=organization_id)

    def resolve(
        self,
        approval_request_id: str,
        action: str,
        organization_id: Optional[str] = None,
    ) -> dict[str, Any]:
        if action not in ("approve", "reject"):
            raise ValueError("action must be 'approve' or 'reject'")
        org = self._resolve_org(organization_id)
        return _unwrap(
            self._http.post(f"{self._base(org)}/{approval_request_id}/{action}", {})
        )

    def approve(
        self,
        approval_request_id: str,
        organization_id: Optional[str] = None,
    ) -> dict[str, Any]:
        return self.resolve(approval_request_id, "approve", organization_id)

    def reject(
        self,
        approval_request_id: str,
        organization_id: Optional[str] = None,
    ) -> dict[str, Any]:
        return self.resolve(approval_request_id, "reject", organization_id)


class AsyncApprovalsApi:
    """Async approvals surface (HITL inbox parity)."""

    unavailable: bool = False

    def __init__(
        self,
        http: AsyncLoxtepHttpClient,
        *,
        organization_id: Optional[str] = None,
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    def _resolve_org(self, override: Optional[str] = None) -> str:
        org = override or self._organization_id
        if not org:
            raise ValueError(
                "organization_id is required for approvals calls "
                "(set it on the client or pass it explicitly)"
            )
        return org

    def _base(self, org: str) -> str:
        return f"/agent-orchestration/organizations/{org}/approval-requests"

    async def list(
        self,
        *,
        status: Optional[str] = None,
        organization_id: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(organization_id)
        qs = _query_string({"status": status, "page": page, "page_size": page_size})
        payload = _unwrap(await self._http.get(f"{self._base(org)}{qs}"))
        if not isinstance(payload, dict):
            return {"items": [], "pagination": None}
        return {
            "items": payload.get("items") or [],
            "pagination": payload.get("pagination"),
        }

    async def list_pending(self, organization_id: Optional[str] = None) -> dict[str, Any]:
        return await self.list(status="pending", organization_id=organization_id)

    async def resolve(
        self,
        approval_request_id: str,
        action: str,
        organization_id: Optional[str] = None,
    ) -> dict[str, Any]:
        if action not in ("approve", "reject"):
            raise ValueError("action must be 'approve' or 'reject'")
        org = self._resolve_org(organization_id)
        return _unwrap(
            await self._http.post(f"{self._base(org)}/{approval_request_id}/{action}", {})
        )

    async def approve(
        self,
        approval_request_id: str,
        organization_id: Optional[str] = None,
    ) -> dict[str, Any]:
        return await self.resolve(approval_request_id, "approve", organization_id)

    async def reject(
        self,
        approval_request_id: str,
        organization_id: Optional[str] = None,
    ) -> dict[str, Any]:
        return await self.resolve(approval_request_id, "reject", organization_id)
