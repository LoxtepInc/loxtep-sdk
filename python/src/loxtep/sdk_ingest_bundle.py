"""
Build local-first SDK ingest workflow package files
(connector + workflow + connection + source data product).

Port of nodejs/src/lib/sdk-ingest-bundle.ts. The workflow entity's `template_id` field
is the fix for a critical bug found in E2E testing: the previously-shipped Node.js
bundle builder (npm @loxtep/sdk 0.7.22) omitted `template_id`, which the backend's
`save_workflow_bundle` schema requires — every `loxtep ingest provision` failed with
`"#/required: must have required property 'template_id'"` on a fresh org. Keep this
constant in sync with the Node.js source.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

# Placeholder starter template id for SDK-provisioned ingestion flows.
SDK_INGEST_TEMPLATE_ID = "00000000-0000-4000-8000-0000000000a1"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def to_local_connector_entity(connector: dict[str, Any], now: Optional[str] = None) -> dict[str, Any]:
    """
    Map an API connector (or stub) into a schema-valid local connector entity.
    Entity schema uses catalog-style fields (name, category, auth_type) that differ
    from the connectors API shape.
    """
    now = now or _now()
    meta = connector.get("metadata") or {}
    connector_type = connector["connector_type"]
    name = (meta.get("name") or "").strip() or f"{connector_type} connector"
    description = (meta.get("description") or "").strip() or f"Local stub for {connector_type} connector"

    return {
        "connector_id": connector["connector_id"],
        "organization_id": connector["organization_id"],
        "connector_type": connector_type,
        "name": name,
        "description": description,
        "category": "custom",
        # Entity schema enum has no "jwt"; use custom and keep API auth in metadata.
        "auth_type": "custom",
        "version": "1.0.0",
        "metadata": {**meta, "sdk_auth_type": "jwt"},
        "created_at": connector.get("created_at", now),
        "updated_at": connector.get("updated_at", now),
    }


def build_sdk_ingest_local_package(
    *,
    organization_id: str,
    project_id: str,
    domain_id: str,
    connector_id: str,
    data_product_name: str,
    workflow_name: Optional[str] = None,
    user_id: Optional[str] = None,
    workflow_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    data_product_id: Optional[str] = None,
    connector: Optional[dict[str, Any]] = None,
    include_connector_file: bool = True,
    iceberg_enabled: bool = False,
) -> dict[str, Any]:
    """
    Build project-local JSON files for an SDK ingest topology.
    Paths match the customer workspace layout (not the flat save_workflow_bundle map).
    """
    workflow_id = workflow_id or str(uuid.uuid4())
    connection_id = connection_id or str(uuid.uuid4())
    data_product_id = data_product_id or str(uuid.uuid4())
    now = _now()
    workflow_name = workflow_name or "SDK App Events Ingest"

    files: dict[str, dict[str, Any]] = {}

    if include_connector_file and connector:
        files[f"connectors/{connector_id}.json"] = to_local_connector_entity(connector, now)

    files[f"workflows/{workflow_id}/workflow.json"] = {
        "workflow_id": workflow_id,
        "organization_id": organization_id,
        "project_id": project_id,
        "name": workflow_name,
        "template_id": SDK_INGEST_TEMPLATE_ID,
        "workflow_type": "ingestion",
        "domain_id": domain_id,
        "status": "active",
        "configuration": {},
        "metadata": {"ingestion_method": "sdk"},
        "created_at": now,
        "updated_at": now,
    }

    files[f"workflows/{workflow_id}/connections/{connection_id}.json"] = {
        "connection_id": connection_id,
        "organization_id": organization_id,
        "project_id": project_id,
        "workflow_id": workflow_id,
        "connector_id": connector_id,
        "key": "sdk-input",
        "name": "SDK Input",
        "type": "sdk",
        "status": "active",
        "configuration": {"sdk_type": "python", "event_type": data_product_name},
        "created_at": now,
        "updated_at": now,
    }

    data_product: dict[str, Any] = {
        "data_product_id": data_product_id,
        "organization_id": organization_id,
        "workflow_id": workflow_id,
        "upstream_entity_id": connection_id,
        "upstream_entity_type": "connections",
        "domain_id": domain_id,
        "name": data_product_name,
        "status": "draft",
        "governance": {
            "classification": "internal",
            "pii_fields": [],
            "compliance_requirements": [],
            "tags": [],
        },
        "metadata": {"kind": "source", "project_id": project_id},
        "created_at": now,
        "updated_at": now,
    }
    if iceberg_enabled:
        data_product["storage"] = {"iceberg_enabled": True}
    if user_id:
        data_product["owner"] = {"user_id": user_id}
    files[f"workflows/{workflow_id}/data-products/{data_product_id}.json"] = data_product

    return {
        "workflow_id": workflow_id,
        "connection_id": connection_id,
        "data_product_id": data_product_id,
        "data_product_name": data_product_name,
        "connector_id": connector_id,
        "files": files,
    }


def build_sdk_ingest_bundle(
    *,
    organization_id: str,
    project_id: str,
    domain_id: str,
    connector_id: str,
    data_product_name: str,
    workflow_name: Optional[str] = None,
    user_id: Optional[str] = None,
    workflow_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    data_product_id: Optional[str] = None,
) -> dict[str, Any]:
    """Flat bundle map for `save_workflow_bundle` / `bundle save` (workflow-relative keys)."""
    local = build_sdk_ingest_local_package(
        organization_id=organization_id,
        project_id=project_id,
        domain_id=domain_id,
        connector_id=connector_id,
        data_product_name=data_product_name,
        workflow_name=workflow_name,
        user_id=user_id,
        workflow_id=workflow_id,
        connection_id=connection_id,
        data_product_id=data_product_id,
        include_connector_file=False,
    )
    wf = local["workflow_id"]
    files = {
        "workflow.json": local["files"][f"workflows/{wf}/workflow.json"],
        f"connections/{local['connection_id']}.json": local["files"][
            f"workflows/{wf}/connections/{local['connection_id']}.json"
        ],
        f"data-products/{local['data_product_id']}.json": local["files"][
            f"workflows/{wf}/data-products/{local['data_product_id']}.json"
        ],
    }
    return {
        "workflow_id": local["workflow_id"],
        "connection_id": local["connection_id"],
        "data_product_id": local["data_product_id"],
        "data_product_name": local["data_product_name"],
        "files": files,
    }
