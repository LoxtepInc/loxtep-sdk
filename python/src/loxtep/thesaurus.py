"""
Thesaurus API (LOX-1476 + Phase 2 meaning parity).
list_terms / get_term / create_term / update_term / delete_term /
sync_vocabulary / create_enterprise_override / resolve_canonical_key /
append_synonym.

Backend:
  GET|POST /graph/organizations/:organization_id/thesaurus
  GET|PUT|DELETE /graph/organizations/:organization_id/thesaurus/:term_id
  POST /graph/organizations/:organization_id/thesaurus/sync
  POST /graph/organizations/:organization_id/thesaurus/synonyms
"""

from __future__ import annotations

from typing import Any, Mapping, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _terms(res: Any) -> list[dict[str, Any]]:
    data = _unwrap(res)
    terms = data.get("terms") if isinstance(data, dict) else None
    return terms if isinstance(terms, list) else []


def _match_canonical_key(terms: list[dict[str, Any]], key_or_alias: str) -> Optional[str]:
    k = key_or_alias.lower()
    for term in terms:
        canonical = str(term.get("canonical_key", ""))
        if canonical.lower() == k:
            return canonical
        for alias in term.get("aliases", []) or []:
            if str(alias.get("path", "")).lower() == k:
                return canonical
    return None


def _thesaurus_base(org: str) -> str:
    return f"/graph/organizations/{quote(org)}/thesaurus"


def _create_term_body(input: Mapping[str, Any]) -> dict[str, Any]:
    body: dict[str, Any] = {
        "canonical_key": input["canonical_key"],
        "scheme": input.get("scheme", "field"),
        "precedence": input.get("precedence", 100),
        "aliases": list(input.get("aliases") or []),
    }
    for key in ("definition", "broader", "narrower", "related", "domain"):
        if key in input:
            body[key] = input[key]
    return body


def _update_term_body(input: Mapping[str, Any]) -> dict[str, Any]:
    body: dict[str, Any] = {}
    for key, value in input.items():
        if key == "organization_id":
            continue
        body[key] = value
    return body


def _enterprise_override_body(input: Mapping[str, Any]) -> dict[str, Any]:
    body: dict[str, Any] = {
        "canonical_key": input["canonical_key"],
        "enterprise_definition": input["enterprise_definition"],
        "divergence_reason": input["divergence_reason"],
        "is_override": True,
        "override_source": input.get("override_source", "manual"),
        "scheme": input.get("scheme", "field"),
        "precedence": input.get("precedence", 100),
        "aliases": list(input.get("aliases") or []),
    }
    for key in (
        "definition",
        "broader",
        "narrower",
        "related",
        "baseline_assumption",
        "linked_data_product_ids",
    ):
        if key in input:
            body[key] = input[key]
    return body


def _delete_result(res: Any) -> dict[str, Any]:
    warnings = res.get("warnings") if isinstance(res, dict) else None
    out: dict[str, Any] = {"term": _unwrap(res)}
    if warnings is not None:
        out["warnings"] = warnings
    return out


class ThesaurusApi:
    """Sync thesaurus surface."""

    def __init__(self, http: LoxtepHttpClient, organization_id: Optional[str] = None) -> None:
        self._http = http
        self._organization_id = organization_id

    def _resolve_org(self, org_id: Optional[str] = None) -> str:
        org = org_id or self._organization_id
        if not org:
            raise ValueError("organization_id required (pass org_id or set it on the client)")
        return org

    def list_terms(self, org_id: Optional[str] = None) -> list[dict[str, Any]]:
        org = self._resolve_org(org_id)
        return _terms(self._http.get(_thesaurus_base(org)))

    def get_term(self, term_id: str, org_id: Optional[str] = None) -> dict[str, Any]:
        if not term_id:
            raise ValueError("term_id is required")
        org = self._resolve_org(org_id)
        res = self._http.get(f"{_thesaurus_base(org)}/{quote(term_id)}")
        return _unwrap(res)

    def create_term(self, input: Mapping[str, Any]) -> dict[str, Any]:
        if not input.get("canonical_key"):
            raise ValueError("canonical_key is required")
        org = self._resolve_org(input.get("organization_id"))
        res = self._http.post(_thesaurus_base(org), _create_term_body(input))
        return _unwrap(res)

    def update_term(self, term_id: str, input: Mapping[str, Any]) -> dict[str, Any]:
        if not term_id:
            raise ValueError("term_id is required")
        org = self._resolve_org(input.get("organization_id"))
        res = self._http.put(
            f"{_thesaurus_base(org)}/{quote(term_id)}",
            _update_term_body(input),
        )
        return _unwrap(res)

    def delete_term(self, term_id: str, org_id: Optional[str] = None) -> dict[str, Any]:
        if not term_id:
            raise ValueError("term_id is required")
        org = self._resolve_org(org_id)
        res = self._http.delete(f"{_thesaurus_base(org)}/{quote(term_id)}")
        return _delete_result(res)

    def sync_vocabulary(self, input: Mapping[str, Any]) -> dict[str, Any]:
        org = self._resolve_org(input.get("organization_id"))
        body = {
            "domain": input["domain"],
            "terms": input["terms"],
            "mode": input["mode"],
            "dry_run": input.get("dry_run", False),
        }
        res = self._http.post(f"{_thesaurus_base(org)}/sync", body)
        return _unwrap(res)

    def create_enterprise_override(self, input: Mapping[str, Any]) -> dict[str, Any]:
        for key in ("canonical_key", "enterprise_definition", "divergence_reason"):
            if not input.get(key):
                raise ValueError(f"{key} is required")
        org = self._resolve_org(input.get("organization_id"))
        res = self._http.post(_thesaurus_base(org), _enterprise_override_body(input))
        return _unwrap(res)

    def resolve_canonical_key(self, key_or_alias: str, org_id: Optional[str] = None) -> Optional[str]:
        return _match_canonical_key(self.list_terms(org_id), key_or_alias)

    def append_synonym(
        self,
        canonical_key: str,
        alias_path: str,
        *,
        system: Optional[str] = None,
        precedence: int = 100,
        org_id: Optional[str] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(org_id)
        body = {
            "canonical_key": canonical_key,
            "alias_path": alias_path,
            "system": system,
            "precedence": precedence,
        }
        res = self._http.post(f"{_thesaurus_base(org)}/synonyms", body)
        return _unwrap(res)


class AsyncThesaurusApi:
    """Async thesaurus surface."""

    def __init__(self, http: AsyncLoxtepHttpClient, organization_id: Optional[str] = None) -> None:
        self._http = http
        self._organization_id = organization_id

    def _resolve_org(self, org_id: Optional[str] = None) -> str:
        org = org_id or self._organization_id
        if not org:
            raise ValueError("organization_id required (pass org_id or set it on the client)")
        return org

    async def list_terms(self, org_id: Optional[str] = None) -> list[dict[str, Any]]:
        org = self._resolve_org(org_id)
        return _terms(await self._http.get(_thesaurus_base(org)))

    async def get_term(self, term_id: str, org_id: Optional[str] = None) -> dict[str, Any]:
        if not term_id:
            raise ValueError("term_id is required")
        org = self._resolve_org(org_id)
        res = await self._http.get(f"{_thesaurus_base(org)}/{quote(term_id)}")
        return _unwrap(res)

    async def create_term(self, input: Mapping[str, Any]) -> dict[str, Any]:
        if not input.get("canonical_key"):
            raise ValueError("canonical_key is required")
        org = self._resolve_org(input.get("organization_id"))
        res = await self._http.post(_thesaurus_base(org), _create_term_body(input))
        return _unwrap(res)

    async def update_term(self, term_id: str, input: Mapping[str, Any]) -> dict[str, Any]:
        if not term_id:
            raise ValueError("term_id is required")
        org = self._resolve_org(input.get("organization_id"))
        res = await self._http.put(
            f"{_thesaurus_base(org)}/{quote(term_id)}",
            _update_term_body(input),
        )
        return _unwrap(res)

    async def delete_term(self, term_id: str, org_id: Optional[str] = None) -> dict[str, Any]:
        if not term_id:
            raise ValueError("term_id is required")
        org = self._resolve_org(org_id)
        res = await self._http.delete(f"{_thesaurus_base(org)}/{quote(term_id)}")
        return _delete_result(res)

    async def sync_vocabulary(self, input: Mapping[str, Any]) -> dict[str, Any]:
        org = self._resolve_org(input.get("organization_id"))
        body = {
            "domain": input["domain"],
            "terms": input["terms"],
            "mode": input["mode"],
            "dry_run": input.get("dry_run", False),
        }
        res = await self._http.post(f"{_thesaurus_base(org)}/sync", body)
        return _unwrap(res)

    async def create_enterprise_override(self, input: Mapping[str, Any]) -> dict[str, Any]:
        for key in ("canonical_key", "enterprise_definition", "divergence_reason"):
            if not input.get(key):
                raise ValueError(f"{key} is required")
        org = self._resolve_org(input.get("organization_id"))
        res = await self._http.post(_thesaurus_base(org), _enterprise_override_body(input))
        return _unwrap(res)

    async def resolve_canonical_key(
        self, key_or_alias: str, org_id: Optional[str] = None
    ) -> Optional[str]:
        return _match_canonical_key(await self.list_terms(org_id), key_or_alias)

    async def append_synonym(
        self,
        canonical_key: str,
        alias_path: str,
        *,
        system: Optional[str] = None,
        precedence: int = 100,
        org_id: Optional[str] = None,
    ) -> dict[str, Any]:
        org = self._resolve_org(org_id)
        body = {
            "canonical_key": canonical_key,
            "alias_path": alias_path,
            "system": system,
            "precedence": precedence,
        }
        res = await self._http.post(f"{_thesaurus_base(org)}/synonyms", body)
        return _unwrap(res)
