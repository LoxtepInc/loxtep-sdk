"""HTTP wrappers for governance, meaning lifecycle, entities, and CDLC."""

from unittest.mock import MagicMock

import pytest

from loxtep import LoxtepClient
from loxtep.cdlc import CdlcApi
from loxtep.entities import EntitiesApi
from loxtep.governance import GovernanceApi
from loxtep.ontology import OntologyApi
from loxtep.semantic import SemanticLayerApi


def _http() -> MagicMock:
    http = MagicMock()
    http.get.return_value = {"data": {"items": [], "artifacts": [], "tasks": [], "clusters": []}}
    http.post.return_value = {"data": {"ok": True}}
    http.put.return_value = {"data": {"ok": True}}
    http.delete.return_value = {"data": {"deleted": True}}
    return http


def test_policies_list_lowercases_bool_and_omits_org_from_query():
    http = _http()
    api = GovernanceApi(http, organization_id="org-1")
    api.policies.list(
        {
            "page": 2,
            "page_size": 10,
            "search": "freeze",
            "domain_id": "dom-1",
            "include_org_policies": False,
            "type": "data_governance",
            "organization_id": "org-1",
        }
    )
    assert http.get.call_args[0][0] == (
        "/governance/policies?page=2&page_size=10&search=freeze&domain_id=dom-1"
        "&include_org_policies=false&type=data_governance"
    )


def test_policy_create_update_get_delete():
    http = _http()
    api = GovernanceApi(http, organization_id="org-1")
    api.policies.create(
        {
            "name": "Freeze",
            "organization_id": "org-1",
            "policy_id": "should-not-send",
            "rules": [{"condition": "true", "action": "deny", "resources": ["*"]}],
        }
    )
    body = http.post.call_args[0][1]
    assert http.post.call_args[0][0] == "/governance/policies"
    assert "organization_id" not in body
    assert "policy_id" not in body
    assert "type" not in body
    assert body["name"] == "Freeze"

    api.policies.update("pol-1", {"description": None, "status": "active", "policy_id": "pol-1"})
    assert http.put.call_args[0][0] == "/governance/policies/pol-1"
    assert http.put.call_args[0][1] == {"status": "active"}

    api.policies.get("pol-1")
    assert http.get.call_args[0][0] == "/governance/policies/pol-1"
    api.policies.delete("pol-1")
    assert http.delete.call_args[0][0] == "/governance/policies/pol-1"


def test_access_requests_create_list_decide():
    http = _http()
    api = GovernanceApi(http, organization_id="org-1")
    resource_id = "22222222-2222-2222-2222-222222222222"
    api.access_requests.create(
        {
            "resource_type": "domain",
            "resource_id": resource_id,
            "access_type": "viewer",
            "justification": "Need read access",
            "organization_id": "org-1",
        }
    )
    assert http.post.call_args[0][0] == "/governance/access-requests"
    assert "organization_id" not in http.post.call_args[0][1]

    api.access_requests.list(
        {
            "page": 1,
            "status": "pending",
            "resource_type": "domain",
            "resource_id": resource_id,
        }
    )
    assert http.get.call_args[0][0] == (
        "/governance/access-requests?page=1&status=pending"
        f"&resource_type=domain&resource_id={resource_id}"
    )

    api.access_requests.decide(
        "req-1",
        {"action": "reject", "rejection_reason": "no", "access_request_id": "req-1"},
    )
    assert http.put.call_args[0][0] == "/governance/access-requests/req-1"
    assert http.put.call_args[0][1] == {"action": "reject", "rejection_reason": "no"}


def test_governance_requires_organization_id():
    api = GovernanceApi(_http())
    with pytest.raises(ValueError, match="organization_id"):
        api.policies.list()


def test_semantic_inference_glossary_relationships_and_projection():
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org-1")
    http = client._http
    with pytest.MonkeyPatch.context() as patcher:
        post = MagicMock(return_value={"data": {"run_id": "run-1"}})
        get = MagicMock(return_value={"data": {"status": "ready"}})
        patcher.setattr(http, "post", post)
        patcher.setattr(http, "get", get)

        client.build.data_products.semantic_inference.request("dp-1")
        assert post.call_args[0] == ("/dataproducts/dataproducts/dp-1/semantic-inference", {})
        client.build.data_products.semantic_inference.get("dp-1")
        assert get.call_args[0][0] == "/dataproducts/dataproducts/dp-1/semantic-inference"
        client.build.data_products.semantic_inference.promote(
            "dp-1", {"run_id": "run-1", "action": "accept"}
        )
        assert post.call_args[0][0].endswith("/semantic-inference/promote")
        assert post.call_args[0][1] == {"run_id": "run-1", "action": "accept"}
        client.build.data_products.semantic_inference.promote(
            "dp-1", {"run_id": "run-1", "action": "dismiss", "issue_id": "iss-1"}
        )
        assert post.call_args[0][1]["issue_id"] == "iss-1"

        client.meaning.semantic.apply_glossary_bindings({"data_product_id": "dp-1"})
        assert post.call_args[0] == (
            "/semantic-layer/glossary/bindings",
            {"data_product_id": "dp-1"},
        )

        client.meaning.ontology.discover_ontology_relationships()
        assert post.call_args[0] == ("/graph/relationships/discover", {})
        client.meaning.ontology.discover_ontology_relationships({"limit": 25})
        assert post.call_args[0][1] == {"limit": 25}

        rel = {
            "source_entity_type": "Order",
            "target_entity_type": "Customer",
            "relation_type": "placed_by",
        }
        client.meaning.ontology.accept_ontology_relationships({"relationships": [rel]})
        assert post.call_args[0][0] == "/graph/relationships/accept"
        assert "data_product_id" not in post.call_args[0][1]
        client.meaning.ontology.accept_ontology_relationships(
            {"relationships": [rel], "data_product_id": "dp-1"}
        )
        assert post.call_args[0][1]["data_product_id"] == "dp-1"

        client.entities.infer_projection("ent-1")
        assert post.call_args[0] == ("/entities/entities/ent-1/projections/infer", {})
        client.entities.infer_projection("ent-1", {"linked_data_product_ids": ["dp-1"]})
        assert post.call_args[0][1] == {"linked_data_product_ids": ["dp-1"]}
    client.close()


def test_cdlc_lifecycle_helpers():
    http = _http()
    api = CdlcApi(http, organization_id="org1")
    api.list_artifacts(
        {
            "lifecycle_state": "draft",
            "scope": "personal",
            "artifact_type": "thesaurus_term",
            "owner": "alice",
            "domain_id": "dom-1",
        }
    )
    assert http.get.call_args[0][0] == (
        "/graph/organizations/org1/cdlc/artifacts?lifecycle_state=draft&scope=personal"
        "&artifact_type=thesaurus_term&owner=alice&domain_id=dom-1"
    )

    api.submit_for_review({"artifact_refs": ["ref-a"]})
    assert http.post.call_args[0] == (
        "/graph/organizations/org1/cdlc/artifacts/submit-for-review",
        {"artifact_refs": ["ref-a"]},
    )

    api.list_review_queue()
    review_path = http.get.call_args[0][0]
    api.list_cdlc_review_queue()
    assert http.get.call_args[0][0] == review_path
    assert review_path == "/graph/organizations/org1/cdlc/review-queue"

    api.list_identity_clusters()
    assert http.get.call_args[0][0] == "/graph/organizations/org1/cdlc/identity-clusters"

    api.approve_review({"task_id": "task-1"})
    assert http.post.call_args[0] == (
        "/graph/organizations/org1/cdlc/review-queue/task-1/approve",
        {},
    )

    bare = CdlcApi(http)
    bare.bridge_semantics({"data_product_id": "dp-1"})
    assert http.post.call_args[0] == (
        "/graph/cdlc/bridge-semantics",
        {"data_product_id": "dp-1"},
    )


def test_direct_helpers_match_client_methods():
    assert hasattr(SemanticLayerApi, "apply_glossary_bindings")
    assert hasattr(OntologyApi, "discover_ontology_relationships")
    assert hasattr(OntologyApi, "accept_ontology_relationships")
    assert hasattr(EntitiesApi, "infer_projection")


def test_client_wires_lifecycle_namespaces():
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org-1")
    assert hasattr(client.governance.policies, "list")
    assert hasattr(client.governance.access_requests, "decide")
    assert hasattr(client.define.standards, "list")
    assert hasattr(client.entities, "infer_projection")
    assert hasattr(client.build.data_products.semantic_inference, "request")
    assert hasattr(client.meaning.semantic, "apply_glossary_bindings")
    assert hasattr(client.meaning.ontology, "discover_ontology_relationships")
    assert hasattr(client.meaning.ontology, "accept_ontology_relationships")
    assert hasattr(client.review.cdlc, "list_artifacts")
    assert hasattr(client.review.cdlc, "list_cdlc_review_queue")
    assert hasattr(client.review.cdlc, "list_review_queue")
    assert hasattr(client.review.cdlc, "bridge_semantics")
    client.close()
