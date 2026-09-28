"""Define facade (MCP: loxtep_define).

Delegates to schemas (data-product), shapes (domain canonical), quality,
standards, data_contracts, and domains APIs.
"""

from __future__ import annotations

from dataclasses import dataclass

from .data_contracts import DataContractsApi
from .domains import DomainsApi
from .quality import QualityApi
from .schemas import SchemasApi
from .shapes import ShapesApi
from .standards import StandardsApi


@dataclass(frozen=True)
class DefineFacade:
    schemas: SchemasApi
    shapes: ShapesApi
    quality: QualityApi
    standards: StandardsApi
    data_contracts: DataContractsApi
    domains: DomainsApi
