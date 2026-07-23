"""Define facade (MCP: loxtep_define)."""

from __future__ import annotations

from dataclasses import dataclass

from .data_contracts import DataContractsApi
from .domains import DomainsApi
from .quality import QualityApi
from .schemas import SchemasApi
from .standards import StandardsApi


@dataclass(frozen=True)
class DefineFacade:
    schemas: SchemasApi
    quality: QualityApi
    standards: StandardsApi
    data_contracts: DataContractsApi
    domains: DomainsApi
