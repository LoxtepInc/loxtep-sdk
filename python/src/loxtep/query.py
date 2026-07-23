"""Query facade (MCP: loxtep_query)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .catalog import CatalogApi
from .discovery import DiscoveryApi


@dataclass
class QueryFacade:
    catalog: CatalogApi
    discovery: DiscoveryApi
    _query: Callable[..., Any]
    _list_tables: Callable[..., Any]
    _search: Callable[..., Any]

    def query(self, *args: Any, **kwargs: Any) -> Any:
        return self._query(*args, **kwargs)

    def list_tables(self, *args: Any, **kwargs: Any) -> Any:
        return self._list_tables(*args, **kwargs)

    def search(self, *args: Any, **kwargs: Any) -> Any:
        return self._search(*args, **kwargs)
