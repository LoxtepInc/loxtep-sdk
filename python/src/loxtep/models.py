"""
Pydantic models for the Loxtep Python SDK.

Typed representations of API resources including DataProduct, Target,
UsageMapNode, and UsageMapEdge.
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


# ---------------------------------------------------------------------------
# Delivery Interface
# ---------------------------------------------------------------------------

# NOTE: `TargetType`/the old `consumptions`-backed `Target` shape were removed. The
# `/dataproducts/{id}/consumptions` architecture they described no longer exists on the
# backend — targets (and triggers) are now workflow "connection" entities under the
# project entities API (`/workflows/projects/{project_id}/entities`), matching the
# Node SDK's `Trigger`/`Target` interfaces (see nodejs/src/client/trigger-types.ts,
# target-types.ts). Kept as pydantic models here (rather than plain dicts, unlike Node)
# for consistency with the rest of this SDK's typed surface.


class Trigger(BaseModel):
    """An ingest-side source binding (workflow connection node).

    Backend: project entities API (`/workflows/projects/{project_id}/entities`).
    ("connections" is the backend term; the SDK surface names these `triggers`.)
    """

    connection_id: str = Field(..., description="Unique identifier for the trigger")
    organization_id: Optional[str] = Field(default=None, description="Owning organization")
    project_id: Optional[str] = Field(default=None, description="Project the connection belongs to")
    workflow_id: Optional[str] = Field(default=None, description="Workflow the connection node belongs to")
    key: str = Field(..., description="Connection key")
    name: str = Field(..., description="Human-readable name")
    type: str = Field(..., description="Connection type (database, api, webhook, file)")
    status: str = Field(default="active", description="Current status (active, inactive, error)")
    data: str = Field(default="{}", description="Opaque connection data payload")
    configuration: dict[str, Any] = Field(default_factory=dict, description="Type-specific configuration")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary metadata")
    verified: bool = Field(default=False, description="Whether connectivity has been verified")
    draft: bool = Field(default=True, description="Whether this connection is still a draft")
    last_tested: Optional[str] = Field(default=None, description="ISO timestamp of last connectivity test")
    created_by: Optional[str] = Field(default=None)
    updated_by: Optional[str] = Field(default=None)
    created_at: str = Field(default="", description="ISO timestamp of creation")
    updated_at: str = Field(default="", description="ISO timestamp of last update")
    deleted_at: Optional[str] = Field(default=None)

    model_config = {"populate_by_name": True, "extra": "allow"}


class Target(BaseModel):
    """A delivery-side connector binding (workflow connection node at the tail of a
    delivery workflow). Parallel to `Trigger` (ingest-head connections).

    Backend: project entities (`/workflows/projects/{project_id}/entities/.../connections`).
    Does NOT call `/dataproducts/{id}/consumptions` (that architecture was removed).
    """

    connection_id: str = Field(..., description="Unique identifier for the target")
    organization_id: Optional[str] = Field(default=None, description="Owning organization")
    project_id: Optional[str] = Field(default=None, description="Project the connection belongs to")
    workflow_id: Optional[str] = Field(default=None, description="Workflow the connection node belongs to")
    connector_id: Optional[str] = Field(default=None, description="Bound connector id")
    connector_type: Optional[str] = Field(default=None, description="Bound connector type")
    key: str = Field(..., description="Connection key")
    name: str = Field(..., description="Human-readable name")
    type: str = Field(..., description="Connection type")
    status: str = Field(default="active", description="Current status (active, inactive, error)")
    direction: str = Field(default="outbound", description="Delivery direction (targets are outbound)")
    data: str = Field(default="{}", description="Opaque connection data payload")
    configuration: dict[str, Any] = Field(default_factory=dict, description="Type-specific configuration")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary metadata")
    verified: bool = Field(default=False, description="Whether connectivity has been verified")
    draft: bool = Field(default=True, description="Whether this connection is still a draft")
    created_at: str = Field(default="", description="ISO timestamp of creation")
    updated_at: str = Field(default="", description="ISO timestamp of last update")

    model_config = {"populate_by_name": True, "extra": "allow"}
