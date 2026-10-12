"""Governance policies and access requests.

Standards stay on ``client.define.standards`` (``/governance/standards``).
``organization_id`` comes from the client and is not placed on these paths.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional
from urllib.parse import quote, urlencode

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient

POLICIES = "/governance/policies"
ACCESS = "/governance/access-requests"
_OMIT = {"organization_id", "policy_id", "access_request_id"}


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _require_org(stored: Optional[str], override: Optional[str]) -> str:
    org = override or stored
    if not org:
        raise ValueError(
            "organization_id is required for governance calls "
            "(set it on the client or pass it explicitly)"
        )
    return org


def _query(params: Mapping[str, Any]) -> str:
    clean = {
        key: str(value).lower() if isinstance(value, bool) else str(value)
        for key, value in params.items()
        if value is not None
    }
    return "?" + urlencode(clean) if clean else ""


def _body(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key not in _OMIT and value is not None}


class PoliciesApi:
    def __init__(self, http: LoxtepHttpClient, *, organization_id: Optional[str] = None) -> None:
        self._http = http
        self._organization_id = organization_id

    def list(self, filters: Optional[Mapping[str, Any]] = None) -> Any:
        filters = filters or {}
        _require_org(self._organization_id, filters.get("organization_id"))
        qs = _query(
            {
                "page": filters.get("page"),
                "page_size": filters.get("page_size"),
                "search": filters.get("search"),
                "domain_id": filters.get("domain_id"),
                "include_org_policies": filters.get("include_org_policies"),
                "type": filters.get("type"),
            }
        )
        return _unwrap(self._http.get(f"{POLICIES}{qs}"))

    def get(self, policy_id: str, organization_id: Optional[str] = None) -> Any:
        if not policy_id:
            raise ValueError("policy_id is required")
        _require_org(self._organization_id, organization_id)
        return _unwrap(self._http.get(f"{POLICIES}/{quote(policy_id, safe='')}"))

    def create(self, payload: Mapping[str, Any]) -> Any:
        _require_org(self._organization_id, payload.get("organization_id"))
        return _unwrap(self._http.post(POLICIES, _body(payload)))

    def update(self, policy_id: str, payload: Mapping[str, Any]) -> Any:
        if not policy_id:
            raise ValueError("policy_id is required")
        _require_org(self._organization_id, payload.get("organization_id"))
        return _unwrap(self._http.put(f"{POLICIES}/{quote(policy_id, safe='')}", _body(payload)))

    def delete(self, policy_id: str, organization_id: Optional[str] = None) -> Any:
        if not policy_id:
            raise ValueError("policy_id is required")
        _require_org(self._organization_id, organization_id)
        return _unwrap(self._http.delete(f"{POLICIES}/{quote(policy_id, safe='')}"))


class AccessRequestsApi:
    def __init__(self, http: LoxtepHttpClient, *, organization_id: Optional[str] = None) -> None:
        self._http = http
        self._organization_id = organization_id

    def create(self, payload: Mapping[str, Any]) -> Any:
        _require_org(self._organization_id, payload.get("organization_id"))
        return _unwrap(self._http.post(ACCESS, _body(payload)))

    def list(self, filters: Optional[Mapping[str, Any]] = None) -> Any:
        filters = filters or {}
        _require_org(self._organization_id, filters.get("organization_id"))
        qs = _query(
            {
                "page": filters.get("page"),
                "page_size": filters.get("page_size"),
                "status": filters.get("status"),
                "resource_type": filters.get("resource_type"),
                "resource_id": filters.get("resource_id"),
            }
        )
        return _unwrap(self._http.get(f"{ACCESS}{qs}"))

    def decide(self, access_request_id: str, payload: Mapping[str, Any]) -> Any:
        if not access_request_id:
            raise ValueError("access_request_id is required")
        _require_org(self._organization_id, payload.get("organization_id"))
        path = f"{ACCESS}/{quote(access_request_id, safe='')}"
        return _unwrap(self._http.put(path, _body(payload)))


class GovernanceApi:
    def __init__(self, http: LoxtepHttpClient, *, organization_id: Optional[str] = None) -> None:
        self.policies = PoliciesApi(http, organization_id=organization_id)
        self.access_requests = AccessRequestsApi(http, organization_id=organization_id)


class AsyncPoliciesApi:
    def __init__(
        self, http: AsyncLoxtepHttpClient, *, organization_id: Optional[str] = None
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    async def list(self, filters: Optional[Mapping[str, Any]] = None) -> Any:
        filters = filters or {}
        _require_org(self._organization_id, filters.get("organization_id"))
        qs = _query(
            {
                "page": filters.get("page"),
                "page_size": filters.get("page_size"),
                "search": filters.get("search"),
                "domain_id": filters.get("domain_id"),
                "include_org_policies": filters.get("include_org_policies"),
                "type": filters.get("type"),
            }
        )
        return _unwrap(await self._http.get(f"{POLICIES}{qs}"))

    async def get(self, policy_id: str, organization_id: Optional[str] = None) -> Any:
        if not policy_id:
            raise ValueError("policy_id is required")
        _require_org(self._organization_id, organization_id)
        return _unwrap(await self._http.get(f"{POLICIES}/{quote(policy_id, safe='')}"))

    async def create(self, payload: Mapping[str, Any]) -> Any:
        _require_org(self._organization_id, payload.get("organization_id"))
        return _unwrap(await self._http.post(POLICIES, _body(payload)))

    async def update(self, policy_id: str, payload: Mapping[str, Any]) -> Any:
        if not policy_id:
            raise ValueError("policy_id is required")
        _require_org(self._organization_id, payload.get("organization_id"))
        return _unwrap(await self._http.put(f"{POLICIES}/{quote(policy_id, safe='')}", _body(payload)))

    async def delete(self, policy_id: str, organization_id: Optional[str] = None) -> Any:
        if not policy_id:
            raise ValueError("policy_id is required")
        _require_org(self._organization_id, organization_id)
        return _unwrap(await self._http.delete(f"{POLICIES}/{quote(policy_id, safe='')}"))


class AsyncAccessRequestsApi:
    def __init__(
        self, http: AsyncLoxtepHttpClient, *, organization_id: Optional[str] = None
    ) -> None:
        self._http = http
        self._organization_id = organization_id

    async def create(self, payload: Mapping[str, Any]) -> Any:
        _require_org(self._organization_id, payload.get("organization_id"))
        return _unwrap(await self._http.post(ACCESS, _body(payload)))

    async def list(self, filters: Optional[Mapping[str, Any]] = None) -> Any:
        filters = filters or {}
        _require_org(self._organization_id, filters.get("organization_id"))
        qs = _query(
            {
                "page": filters.get("page"),
                "page_size": filters.get("page_size"),
                "status": filters.get("status"),
                "resource_type": filters.get("resource_type"),
                "resource_id": filters.get("resource_id"),
            }
        )
        return _unwrap(await self._http.get(f"{ACCESS}{qs}"))

    async def decide(self, access_request_id: str, payload: Mapping[str, Any]) -> Any:
        if not access_request_id:
            raise ValueError("access_request_id is required")
        _require_org(self._organization_id, payload.get("organization_id"))
        path = f"{ACCESS}/{quote(access_request_id, safe='')}"
        return _unwrap(await self._http.put(path, _body(payload)))


class AsyncGovernanceApi:
    def __init__(
        self, http: AsyncLoxtepHttpClient, *, organization_id: Optional[str] = None
    ) -> None:
        self.policies = AsyncPoliciesApi(http, organization_id=organization_id)
        self.access_requests = AsyncAccessRequestsApi(http, organization_id=organization_id)
