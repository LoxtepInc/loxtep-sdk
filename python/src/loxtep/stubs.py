"""
Stub surfaces for projects, domains, standards (policies), data contracts.
Until backend APIs are exposed, these are no-op or raise NotImplementedError.
"""

from typing import Any


def _stub_list(*args: Any, **kwargs: Any) -> dict[str, Any]:
    return {"items": [], "pagination": {"page": 1, "page_size": 20, "total": 0, "total_pages": 0, "has_next": False, "has_prev": False}}


def _stub_get(*args: Any, **kwargs: Any) -> dict[str, Any]:
    raise NotImplementedError("Not implemented")


class DomainsStub:
    list = _stub_list
    get = _stub_get


class StandardsStub:
    """Standards (backend: policies)."""
    list = _stub_list
    get = _stub_get


class DataContractsStub:
    """Data contracts (backend: data_contracts)."""
    list = _stub_list
    get = _stub_get


domains_stub = DomainsStub()
standards_stub = StandardsStub()
data_contracts_stub = DataContractsStub()
