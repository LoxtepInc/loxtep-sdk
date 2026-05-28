"""
Pydantic models for the Loxtep Python SDK.

Typed representations of API resources including DataProduct, UsageMapNode, and UsageMapEdge.
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Data Product Kind
# ---------------------------------------------------------------------------

DataProductKind = Literal["source", "consumer"]
"""Discriminator chosen at creation time. Drives section routing and chrome."""


# ---------------------------------------------------------------------------
# Data Product
# ---------------------------------------------------------------------------


class DataProduct(BaseModel):
    """A Loxtep Data Product with a required `kind` discriminator."""

    data_product_id: str = Field(..., alias="dataProductId", description="Unique identifier for the data product")
    name: str = Field(..., description="Human-readable name")
    description: str = Field(default="", description="Description of the data product")
    domain: str = Field(default="", description="Domain the data product belongs to")
    kind: DataProductKind = Field(..., description="Whether this is a 'source' or 'consumer' data product")
    status: Optional[str] = Field(default=None, description="Current status (draft, active, deprecated, archived)")
    created_at: Optional[str] = Field(default=None, alias="createdAt", description="ISO timestamp of creation")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt", description="ISO timestamp of last update")

    model_config = {"populate_by_name": True, "extra": "allow"}


# ---------------------------------------------------------------------------
# Usage Map
# ---------------------------------------------------------------------------


class UsageMapNode(BaseModel):
    """A node in the Data Product Usage Map graph."""

    id: str = Field(..., description="Data product ID")
    kind: DataProductKind = Field(..., description="Whether this is a 'source' or 'consumer' data product")
    name: str = Field(..., description="Human-readable name of the data product")
    fanout: int = Field(default=0, description="Number of distinct consumer DPs fed by this source (source nodes only)")

    model_config = {"extra": "allow"}


class UsageMapEdge(BaseModel):
    """An edge in the Data Product Usage Map graph connecting a source to a consumer."""

    source: str = Field(..., description="Source data product ID")
    target: str = Field(..., description="Target (consumer) data product ID")
    projection_spec_id: str = Field(..., description="ID of the projection spec that defines this relationship")

    model_config = {"extra": "allow"}


class UsageMap(BaseModel):
    """The full Usage Map response containing nodes and edges."""

    nodes: list[UsageMapNode] = Field(default_factory=list, description="Data product nodes")
    edges: list[UsageMapEdge] = Field(default_factory=list, description="Source-to-consumer edges")
