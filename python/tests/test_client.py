"""Basic tests for LoxtepClient and error parsing."""

from unittest.mock import patch

import pytest

from loxtep import LoxtepClient
from loxtep.errors import (
    AuthenticationError,
    NotFoundError,
    RateLimitError,
    parse_http_error,
)


def test_parse_http_error_401():
    err = parse_http_error(401, {"message": "Unauthorized"})
    assert isinstance(err, AuthenticationError)
    assert err.message == "Unauthorized"
    assert err.status_code == 401


def test_parse_http_error_404():
    err = parse_http_error(
        404,
        {"message": "Not found", "resource_type": "data_product", "resource_id": "abc"},
    )
    assert isinstance(err, NotFoundError)
    assert err.resource_type == "data_product"
    assert err.resource_id == "abc"


def test_parse_http_error_429():
    err = parse_http_error(
        429,
        {
            "message": "Rate limited",
            "retry_after_seconds": 60,
            "limit": 100,
            "remaining": 0,
        },
    )
    assert isinstance(err, RateLimitError)
    assert err.retry_after_seconds == 60
    assert err.limit == 100
    assert err.remaining == 0


def test_client_has_surface():
    client = LoxtepClient(api_url="https://api.example.com")
    assert client.data_products is not None
    assert client.workflows is not None
    assert client.observe is not None
    assert client.triggers is not None
    assert client.targets is not None
    assert client.queues is not None
    assert client.quality is not None
    assert client.catalog is not None
    assert client.discovery is not None
    assert client.schemas is not None
    assert client.projects is not None
    assert client.domains is not None
    assert client.standards is not None
    assert client.data_contracts is not None
    assert client.metrics is not None
    client.close()


def test_redesigned_surface_renames():
    """Renamed namespaces/methods present; old names gone (clean break)."""
    client = LoxtepClient(api_url="https://api.example.com")
    # Renamed namespaces present
    assert client.triggers is not None
    assert client.targets is not None
    assert client.workflows is not None
    # Old namespaces removed (no aliases)
    assert not hasattr(client, "flows")
    assert not hasattr(client, "connections")
    assert not hasattr(client, "delivery")
    # snake_case short methods on merged/renamed namespaces
    for m in ("list", "get", "create", "get_graph", "deploy", "get_writer"):
        assert hasattr(client.workflows, m), m
    assert not hasattr(client.workflows, "list_workflows")
    assert not hasattr(client.workflows, "get_workflow_graph")
    for m in ("list", "get", "create", "update", "delete", "apply_template"):
        assert hasattr(client.projects, m), m
    assert not hasattr(client.projects, "list_projects")
    assert hasattr(client.templates, "list") and hasattr(client.templates, "get")
    assert hasattr(client.data_products, "create")
    assert not hasattr(client.data_products, "create_data_product")
    assert hasattr(client.discovery, "run")
    assert hasattr(client.triggers, "test")
    client.close()


def test_full_parity_surface_with_nodejs():
    """Namespaces/methods ported to match the Node.js SDK surface."""
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org1")
    # newly ported namespaces
    assert client.thesaurus is not None
    assert client.improvements is not None  # internal
    assert client.activity is not None  # internal
    # data_products parity methods
    for m in ("get_writer", "get_reader", "get_lexicon", "readiness", "promote", "invalidate_cache"):
        assert hasattr(client.data_products, m), m
    # thinner-namespace gaps closed
    assert hasattr(client.schemas, "list") and hasattr(client.schemas, "tag_pii_fields")
    assert hasattr(client.quality, "create")
    assert hasattr(client.projects, "repository")
    assert hasattr(client.instances, "get_stream_config")
    for m in ("list_terms", "resolve_canonical_key", "append_synonym"):
        assert hasattr(client.thesaurus, m), m
    for m in ("list", "apply", "reject"):
        assert hasattr(client.improvements, m), m
    assert hasattr(client.activity, "list")
    client.close()


def test_data_products_get_writer_resolves_name_and_writes():
    """get_writer resolves a name→id via search, then writes via HTTP."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get, patch.object(client._http, "post") as mock_post:
        mock_get.return_value = {
            "success": True,
            "data": {"items": [{"data_product_id": "dp_1", "name": "orders"}]},
        }
        writer = client.data_products.get_writer("orders")
        writer.write({"id": "e1", "name": "Alice"})
        writer.close()
    # resolved by search
    assert "search=orders" in mock_get.call_args[0][0]
    # wrote to the resolved id's events endpoint
    mock_post.assert_called_once_with("/dataproducts/dp_1/events", {"id": "e1", "name": "Alice"})
    client.close()


def test_domains_standards_data_contracts_are_real():
    """Formerly-stubbed namespaces now make real HTTP calls."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"items": [{"domain_id": "d1"}], "pagination": {}}}
        result = client.domains.list()
        assert result["items"][0]["domain_id"] == "d1"
        assert "/organizations/domains" in mock_get.call_args[0][0]
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"items": []}}
        client.standards.list()
        assert "/governance/standards" in mock_get.call_args[0][0]
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {"success": True, "data": {"contract_id": "c1"}}
        result = client.data_contracts.create({"data_product_id": "dp1", "name": "x"})
        assert result["contract_id"] == "c1"
        mock_post.assert_called_once_with("/dataproducts/datacontracts", {"data_product_id": "dp1", "name": "x"})
    client.close()


def test_thesaurus_resolve_canonical_key_matches_alias():
    """resolve_canonical_key matches canonical keys and aliases client-side."""
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org1")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {"terms": [{"canonical_key": "customer_id", "aliases": [{"path": "cust_id"}]}]},
        }
        assert client.thesaurus.resolve_canonical_key("cust_id") == "customer_id"
        assert client.thesaurus.resolve_canonical_key("CUSTOMER_ID") == "customer_id"
        assert client.thesaurus.resolve_canonical_key("nope") is None
    client.close()


def test_workflows_list_returns_data():
    """workflows.list returns response data when get is mocked."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "items": [{"workflow_id": "w1", "name": "Workflow 1", "project_id": "proj-1"}],
                "pagination": {"page": 1, "page_size": 50, "total": 1, "total_pages": 1},
            },
        }
        result = client.workflows.list(project_id="proj-1", page_size=50)
    assert "items" in result
    assert len(result["items"]) == 1
    assert result["items"][0]["name"] == "Workflow 1"
    client.close()


def test_observe_status_returns_data():
    """observe.status returns response data when get is mocked."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"bots": []}}
        result = client.observe.status()
    assert result == {"bots": []}
    client.close()


def test_projects_list_projects_returns_data():
    """projects.list_projects returns items and pagination when get is mocked."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "items": [{"project_id": "p1", "name": "Project 1", "status": "active"}],
                "pagination": {
                    "page": 1,
                    "page_size": 50,
                    "total": 1,
                    "total_pages": 1,
                    "has_next": False,
                    "has_prev": False,
                },
            },
        }
        result = client.projects.list(page_size=50)
    assert "items" in result
    assert len(result["items"]) == 1
    assert result["items"][0]["name"] == "Project 1"
    assert "pagination" in result
    client.close()


def test_projects_get_project_returns_data():
    """projects.get_project returns project when get is mocked."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {"project_id": "p1", "name": "Project 1", "status": "active"},
        }
        result = client.projects.get("p1")
    assert result["project_id"] == "p1"
    assert result["name"] == "Project 1"
    client.close()
