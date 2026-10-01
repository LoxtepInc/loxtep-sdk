"""Define facade (MCP: loxtep_define).

Delegates to schemas (data-product), shapes (domain canonical), quality,
standards, data_contracts, domains, and product_definition APIs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Union

from .data_contracts import AsyncDataContractsApi, DataContractsApi
from .domains import AsyncDomainsApi, DomainsApi
from .product_definition import AsyncProductDefinitionApi, ProductDefinitionApi
from .quality import AsyncQualityApi, QualityApi
from .schemas import AsyncSchemasApi, SchemasApi
from .shapes import AsyncShapesApi, ShapesApi
from .standards import AsyncStandardsApi, StandardsApi


@dataclass(frozen=True)
class DefineFacade:
    schemas: Union[SchemasApi, AsyncSchemasApi]
    shapes: Union[ShapesApi, AsyncShapesApi]
    quality: Union[QualityApi, AsyncQualityApi]
    standards: Union[StandardsApi, AsyncStandardsApi]
    data_contracts: Union[DataContractsApi, AsyncDataContractsApi]
    domains: Union[DomainsApi, AsyncDomainsApi]
    product_definition: Union[ProductDefinitionApi, AsyncProductDefinitionApi]
