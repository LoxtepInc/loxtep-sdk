"""
Thesaurus API (canonical correlation keys + aliases).
list_terms, resolve_canonical_key, append_synonym.
Backend: /graph/organizations/{organization_id}/thesaurus.
"""

from typing import Any, Optional
from urllib.parse import quote

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _terms(res: Any) -> list[dict[str, Any]]:
    data = res.get("data", res) if isinstance(res, dict) else {}
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


class ThesaurusApi:
    """Sync thesaurus surface."""

    def __init__(self, http: LoxtepHttpClient, organization_id: Optional[str] = None) -> None:
        self._http = http
        self._organization_id = organization_id

    def _resolve_org(self, org_id: Optional[str]) -> str:
        org = org_id or self._organization_id
        if not org:
            raise ValueError("organization_id required (pass org_id or set it on the client)")
        return org

    def list_terms(self, org_id: Optional[str] = None) -> list[dict[str, Any]]:
        org = self._resolve_org(org_id)
        res = self._http.get(f"/graph/organizations/{quote(org)}/thesaurus")
        return _terms(res)

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
        res = self._http.post(f"/graph/organizations/{quote(org)}/thesaurus/synonyms", body)
        return res.get("data", res) if isinstance(res, dict) else res


class AsyncThesaurusApi:
    """Async thesaurus surface."""

    def __init__(self, http: AsyncLoxtepHttpClient, organization_id: Optional[str] = None) -> None:
        self._http = http
        self._organization_id = organization_id

    def _resolve_org(self, org_id: Optional[str]) -> str:
        org = org_id or self._organization_id
        if not org:
            raise ValueError("organization_id required (pass org_id or set it on the client)")
        return org

    async def list_terms(self, org_id: Optional[str] = None) -> list[dict[str, Any]]:
        org = self._resolve_org(org_id)
        res = await self._http.get(f"/graph/organizations/{quote(org)}/thesaurus")
        return _terms(res)

    async def resolve_canonical_key(self, key_or_alias: str, org_id: Optional[str] = None) -> Optional[str]:
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
        res = await self._http.post(f"/graph/organizations/{quote(org)}/thesaurus/synonyms", body)
        return res.get("data", res) if isinstance(res, dict) else res
