"""Phase 2 meaning/define parity: thesaurus CRUD, shapes, proposals, bundles."""

from unittest.mock import patch

import pytest

from loxtep import LoxtepClient
from loxtep.errors import LoxtepError


TERM = {
    "term_id": "t1",
    "organization_id": "org1",
    "canonical_key": "order_id",
    "scheme": "field",
    "precedence": 100,
    "aliases": [{"path": "order.id"}],
}


def test_nested_phase2_methods_exist():
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org1")
    for m in (
        "list_terms",
        "get_term",
        "create_term",
        "update_term",
        "delete_term",
        "sync_vocabulary",
        "create_enterprise_override",
        "resolve_canonical_key",
        "append_synonym",
    ):
        assert hasattr(client.meaning.thesaurus, m), m
    for m in ("create", "list", "get", "apply", "align"):
        assert hasattr(client.define.shapes, m), m
    for m in ("list", "accept", "reject", "accept_batch", "reject_batch"):
        assert hasattr(client.meaning.proposals, m), m
    assert hasattr(client.meaning.bundles, "import_")
    client.close()


def test_thesaurus_create_get_update_delete():
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org1")
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {"success": True, "data": TERM}
        created = client.meaning.thesaurus.create_term(
            {"canonical_key": "order_id", "aliases": [{"path": "order.id"}]}
        )
        assert created["term_id"] == "t1"
        mock_post.assert_called_once()
        path, body = mock_post.call_args[0]
        assert path == "/graph/organizations/org1/thesaurus"
        assert body["scheme"] == "field"
        assert body["precedence"] == 100

    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": TERM}
        term = client.meaning.thesaurus.get_term("t1")
        assert term["canonical_key"] == "order_id"
        assert mock_get.call_args[0][0] == "/graph/organizations/org1/thesaurus/t1"

    with patch.object(client._http, "put") as mock_put:
        mock_put.return_value = {"success": True, "data": {**TERM, "definition": "Order id"}}
        updated = client.meaning.thesaurus.update_term("t1", {"definition": "Order id"})
        assert updated["definition"] == "Order id"
        assert mock_put.call_args[0][0] == "/graph/organizations/org1/thesaurus/t1"

    with patch.object(client._http, "delete") as mock_delete:
        mock_delete.return_value = {"success": True, "data": TERM, "warnings": ["in use"]}
        deleted = client.meaning.thesaurus.delete_term("t1")
        assert deleted["term"]["term_id"] == "t1"
        assert deleted["warnings"] == ["in use"]
    client.close()


def test_thesaurus_sync_and_enterprise_override():
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org1")
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {
            "success": True,
            "data": {
                "created": {"count": 1, "term_ids": ["t1"]},
                "updated": {"count": 0, "term_ids": []},
                "tombstoned": {"count": 0, "term_ids": []},
                "unchanged": {"count": 0},
                "conflicts": [],
                "dry_run": False,
            },
        }
        result = client.meaning.thesaurus.sync_vocabulary(
            {
                "domain": "commerce",
                "mode": "additive_only",
                "terms": [{"canonical_key": "order_id", "scheme": "field"}],
            }
        )
        assert result["created"]["count"] == 1
        assert mock_post.call_args[0][0] == "/graph/organizations/org1/thesaurus/sync"

    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {"success": True, "data": {**TERM, "is_override": True}}
        term = client.meaning.thesaurus.create_enterprise_override(
            {
                "canonical_key": "order_id",
                "enterprise_definition": "Our order id",
                "divergence_reason": "legacy ERP",
            }
        )
        assert term["is_override"] is True
        body = mock_post.call_args[0][1]
        assert body["is_override"] is True
        assert body["override_source"] == "manual"
    client.close()


def test_shapes_create_list_get_apply_align():
    client = LoxtepClient(api_url="https://api.example.com")
    shape = {
        "schema_id": "s1",
        "organization_id": "org1",
        "name": "PersonIdentity",
    }
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {
            "success": True,
            "data": {**shape, "schema_version_id": "v1", "version": "1.0.0", "format": "json-schema"},
        }
        created = client.define.shapes.create(
            {
                "name": "PersonIdentity",
                "format": "json-schema",
                "fields": [{"name": "email", "type": "string"}],
            }
        )
        assert created["schema_id"] == "s1"
        assert mock_post.call_args[0][0] == "/semantic-layer/schemas"
        assert mock_post.call_args[0][1]["version"] == "1.0.0"

    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {"items": [shape], "pagination": {"total": 1}},
        }
        listed = client.define.shapes.list(domain_id="d1")
        assert listed["shapes"] == [shape]
        assert listed["total"] == 1
        assert mock_get.call_args[0][0] == "/semantic-layer/schemas?domain=d1"

    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "schema": shape,
                "versions": [
                    {
                        "schema_id": "s1",
                        "schema_version_id": "v1",
                        "version": "1.0.0",
                        "format": "json-schema",
                    }
                ],
            },
        }
        detail = client.define.shapes.get("s1")
        assert detail["schema"]["schema_id"] == "s1"
        assert len(detail["versions"]) == 1

    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {
            "success": True,
            "data": {"schema_id": "s1", "data_product_id": "dp1"},
        }
        app = client.define.shapes.apply({"schema_id": "s1", "data_product_id": "dp1"})
        assert app["data_product_id"] == "dp1"
        assert mock_post.call_args[0][0] == "/semantic-layer/schemas/s1/applications"

    with patch.object(client._http, "put") as mock_put:
        mock_put.return_value = {
            "success": True,
            "data": {**shape, "aligned_to_concept_uri": "concept:person"},
        }
        aligned = client.define.shapes.align(
            {"schema_id": "s1", "aligned_to_concept_uri": "concept:person"}
        )
        assert aligned["aligned_to_concept_uri"] == "concept:person"
        assert mock_put.call_args[0][1] == {"aligned_to_concept_uri": "concept:person"}
    client.close()


def test_proposals_list_accept_reject_batch():
    client = LoxtepClient(api_url="https://api.example.com")
    proposal = {
        "semantic_proposal_id": "p1",
        "organization_id": "org1",
        "proposal_type": "vocabulary_term",
        "proposal_payload": {"canonical_key": "email"},
        "disposition": "pending",
    }
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "items": [proposal],
                "pagination": {
                    "page": 1,
                    "page_size": 20,
                    "total": 1,
                    "total_pages": 1,
                    "has_next": False,
                    "has_prev": False,
                },
            },
        }
        listed = client.meaning.proposals.list(disposition="pending", page=1)
        assert listed["items"][0]["semantic_proposal_id"] == "p1"
        assert "disposition=pending" in mock_get.call_args[0][0]

    with patch.object(client._http, "put") as mock_put:
        mock_put.return_value = {
            "success": True,
            "data": {"semantic_proposal_id": "p1", "disposition": "accepted"},
        }
        accepted = client.meaning.proposals.accept("p1", resolution_note="ok")
        assert accepted["disposition"] == "accepted"
        assert mock_put.call_args[0][1] == {
            "disposition": "accepted",
            "resolution_note": "ok",
        }

    with patch.object(client._http, "put") as mock_put:
        mock_put.return_value = {
            "success": True,
            "data": {"semantic_proposal_id": "p1", "disposition": "rejected"},
        }
        rejected = client.meaning.proposals.reject("p1")
        assert rejected["disposition"] == "rejected"

    with patch.object(client._http, "put") as mock_put:
        mock_put.side_effect = [
            {"success": True, "data": {"semantic_proposal_id": "p1", "disposition": "accepted"}},
            LoxtepError("boom", status_code=500),
        ]
        batch = client.meaning.proposals.accept_batch(
            {"semantic_proposal_ids": ["p1", "p2"]}
        )
        assert batch["succeeded"] == 1
        assert batch["failed"] == 1
        assert batch["results"][0]["ok"] is True
        assert batch["results"][1]["ok"] is False
    client.close()


def test_bundles_import_surfaces_skips_and_422():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {
            "success": True,
            "data": {
                "dry_run": False,
                "applied_count": 1,
                "skipped_count": 1,
                "errors": [
                    {
                        "artifact_id": "x",
                        "artifact_type": "ontology_concept",
                        "message": "unsupported",
                    }
                ],
                "applied": [
                    {"artifact_id": "a1", "artifact_type": "thesaurus_term", "action": "created"}
                ],
            },
        }
        result = client.meaning.bundles.import_(
            {"bundle": {"artifacts": [{"artifact_id": "a1", "artifact_type": "thesaurus_term"}]}}
        )
        assert result["skipped_count"] == 1
        assert result["partial"] is True
        assert mock_post.call_args[0][0] == "/semantic-layer/bundles/import"

    with patch.object(client._http, "post") as mock_post:
        mock_post.side_effect = LoxtepError(
            "Partial import",
            code="VALIDATION_ERROR",
            status_code=422,
            details={
                "dry_run": False,
                "applied_count": 0,
                "skipped_count": 1,
                "errors": [
                    {
                        "artifact_id": "x",
                        "artifact_type": "ontology_concept",
                        "message": "skipped",
                    }
                ],
                "applied": [],
            },
        )
        result = client.meaning.bundles.import_(
            {"bundle": {"artifacts": [{"artifact_id": "x", "artifact_type": "ontology_concept"}]}}
        )
        assert result["partial"] is True
        assert result["status_code"] == 422
        assert result["errors"][0]["message"] == "skipped"

    with pytest.raises(ValueError, match="bundle is required"):
        client.meaning.bundles.import_({})
    client.close()
