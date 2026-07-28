"""
Port of nodejs/src/lib/sdk-ingest-bundle.test.ts's structural coverage (the JSON-schema
entity validation / lint subsystem it also exercises has no Python port yet, so those
cases are intentionally not mirrored here).
"""

from loxtep import SDK_INGEST_TEMPLATE_ID, build_sdk_ingest_bundle, build_sdk_ingest_local_package

ORG = "22222222-2222-4222-8222-222222222222"
PROJECT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
DOMAIN = "33333333-3333-4333-8333-333333333333"
CONNECTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
USER = "11111111-1111-4111-8111-111111111111"
WF = "66666666-6666-4666-8666-666666666666"
CONN = "77777777-7777-4777-8777-777777777777"
DP = "55555555-5555-4555-8555-555555555555"


def test_build_local_package_writes_schema_valid_paths():
    result = build_sdk_ingest_local_package(
        organization_id=ORG,
        project_id=PROJECT,
        domain_id=DOMAIN,
        connector_id=CONNECTOR,
        data_product_name="app-events",
        user_id=USER,
        workflow_id=WF,
        connection_id=CONN,
        data_product_id=DP,
        connector={
            "connector_id": CONNECTOR,
            "organization_id": ORG,
            "connector_type": "sdk",
            "metadata": {"name": "SDK"},
        },
    )

    workflow_entity = result["files"][f"workflows/{WF}/workflow.json"]
    assert workflow_entity["template_id"] == SDK_INGEST_TEMPLATE_ID
    assert workflow_entity["workflow_type"] == "ingestion"

    connector_entity = result["files"][f"connectors/{CONNECTOR}.json"]
    assert connector_entity["connector_type"] == "sdk"
    assert connector_entity["category"] == "custom"
    assert connector_entity["auth_type"] == "custom"


def test_build_bundle_produces_flat_workflow_relative_files():
    result = build_sdk_ingest_bundle(
        organization_id=ORG,
        project_id=PROJECT,
        domain_id=DOMAIN,
        connector_id=CONNECTOR,
        data_product_name="app-events",
        workflow_id=WF,
        connection_id=CONN,
        data_product_id=DP,
    )

    assert result["workflow_id"] == WF
    assert result["files"]["workflow.json"]["workflow_id"] == WF
    assert result["files"]["workflow.json"]["workflow_type"] == "ingestion"
    assert result["files"][f"connections/{CONN}.json"]["connector_id"] == CONNECTOR
    assert result["files"][f"connections/{CONN}.json"]["type"] == "sdk"
    dp_entity = result["files"][f"data-products/{DP}.json"]
    assert dp_entity["name"] == "app-events"
    assert dp_entity["upstream_entity_id"] == CONN
    assert dp_entity["metadata"]["kind"] == "source"
