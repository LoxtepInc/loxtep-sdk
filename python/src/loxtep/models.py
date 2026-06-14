"""
Pydantic models for the Loxtep Python SDK.

Typed representations of API resources including DataProduct, DeliveryInterface,
UsageMapNode, and UsageMapEdge.
"""

import warnings
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


# ---------------------------------------------------------------------------
# Delivery Interface
# ---------------------------------------------------------------------------

DeliveryType = Literal[
    "webhook",
    "api_endpoint",
    "export",
    "database_sync",
    "bi_connect",
    "event_stream",
]
"""Discriminator for the delivery pattern used by a delivery interface."""


class DeliveryInterface(BaseModel):
    """A delivery interface record (stored in the `consumptions` table).

    Delivery interfaces define how a data product makes its data available to
    external systems. Previously called "consumption" — the database table
    retains the old name for migration safety.
    """

    consumption_id: str = Field(..., description="Unique identifier for the delivery interface")
    data_product_id: str = Field(..., description="The data product this interface belongs to")
    organization_id: str = Field(..., description="Owning organization")
    delivery_type: DeliveryType = Field(
        ..., description="The delivery pattern: webhook, api_endpoint, export, database_sync, bi_connect, event_stream"
    )
    delivery_method: str = Field(default="", description="Delivery method identifier")
    status: str = Field(default="active", description="Current status (active, paused, failed, etc.)")
    is_active: bool = Field(default=True, description="Whether this delivery interface is currently active")
    endpoint_url: Optional[str] = Field(default=None, description="Target endpoint URL (for webhook/api_endpoint)")
    method: str = Field(default="POST", description="HTTP method (default POST)")
    name: Optional[str] = Field(default=None, description="Human-readable name")
    description: Optional[str] = Field(default=None, description="Description of this delivery interface")
    headers: dict[str, Any] = Field(default_factory=dict, description="Custom HTTP headers")
    filters: dict[str, Any] = Field(default_factory=dict, description="Event/data filters")
    configuration: dict[str, Any] = Field(default_factory=dict, description="Pattern-specific configuration")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary metadata")
    created_at: str = Field(default="", description="ISO timestamp of creation")
    updated_at: str = Field(default="", description="ISO timestamp of last update")

    model_config = {"populate_by_name": True, "extra": "allow"}


def _consumption_deprecated_init(self: "DeliveryInterface", **data: Any) -> None:
    """Deprecated: Use DeliveryInterface instead."""
    warnings.warn(
        "Consumption is deprecated. Use DeliveryInterface instead. "
        "See /docs/reference/terminology-changes for migration guide.",
        DeprecationWarning,
        stacklevel=2,
    )
    DeliveryInterface.__init__(self, **data)


# Consumption: deprecated alias for DeliveryInterface.
# Retained for backward compatibility — will be removed no sooner than 6 months
# after the delivery namespace ships.
Consumption = DeliveryInterface
"""Deprecated alias for DeliveryInterface. Use DeliveryInterface instead."""
