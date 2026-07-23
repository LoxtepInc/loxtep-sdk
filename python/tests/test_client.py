"""Basic tests for LoxtepClient and error parsing."""

from unittest.mock import patch

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


def test_client_has_ten_namespaces():
    client = LoxtepClient(api_url="https://api.example.com")
    assert client.session is not None
    assert client.connect is not None
    assert client.workspace is not None
    assert client.build is not None
    assert client.define is not None
    assert client.meaning is not None
    assert client.review is not None
    assert client.query is not None
    assert client.observe is not None
    assert client.context is not None
    assert hasattr(client, "get_writer")
    assert hasattr(client, "get_reader")
    assert client.metrics is not None
    client.close()


def test_greenfield_surface_old_namespaces_removed():
    client = LoxtepClient(api_url="https://api.example.com")
    assert not hasattr(client, "data_products")
    assert not hasattr(client, "workflows")
    assert not hasattr(client, "triggers")
    assert not hasattr(client, "projects")
    assert not hasattr(client, "connectors")
    assert not hasattr(client, "queues")
    assert not hasattr(client, "domains")
    assert not hasattr(client, "flows")
    assert not hasattr(client, "connections")
    client.close()


def test_nested_apis_and_snake_case_methods():
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org1")
    for m in ("list", "get", "create", "get_graph", "deploy", "get_writer"):
        assert hasattr(client.build.workflows, m), m
    assert not hasattr(client.build.workflows, "list_workflows")
    for m in ("list", "get", "create", "update", "delete", "apply_template"):
        assert hasattr(client.workspace.projects, m), m
    assert hasattr(client.connect.templates, "list")
    assert hasattr(client.build.data_products, "create")
    assert not hasattr(client.build.data_products, "create_data_product")
    assert hasattr(client.query.discovery, "run")
    assert hasattr(client.build.triggers, "test")
    for m in ("get_writer", "get_reader", "get_lexicon", "readiness", "promote", "invalidate_cache"):
        assert hasattr(client.build.data_products, m), m
    assert hasattr(client.define.schemas, "list")
    assert hasattr(client.define.quality, "create")
    assert hasattr(client.workspace.projects, "repository")
    assert hasattr(client.workspace.instances, "get_stream_config")
    for m in ("list_terms", "resolve_canonical_key", "append_synonym"):
        assert hasattr(client.meaning.thesaurus, m), m
    for m in ("list", "apply", "reject"):
        assert hasattr(client.review.improvements, m), m
    assert hasattr(client.context.activity, "list")
    client.close()


def test_data_products_get_writer_resolves_name_and_writes():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get, patch.object(client._http, "post") as mock_post:
        mock_get.return_value = {
            "success": True,
            "data": {"items": [{"data_product_id": "dp_1", "name": "orders"}]},
        }
        writer = client.get_writer("orders")
        writer.write({"id": "e1", "name": "Alice"})
        writer.close()
    assert "search=orders" in mock_get.call_args[0][0]
    mock_post.assert_called_once_with("/dataproducts/dp_1/events", {"id": "e1", "name": "Alice"})
    client.close()


def test_top_level_get_writer_delegates_to_data_products():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._data_products, "get_writer", return_value="writer") as mock_writer:
        assert client.get_writer("orders") == "writer"
        mock_writer.assert_called_once_with("orders")
    client.close()


def test_define_facades_make_real_http_calls():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"items": [{"domain_id": "d1"}], "pagination": {}}}
        result = client.define.domains.list()
        assert result["items"][0]["domain_id"] == "d1"
        assert "/organizations/domains" in mock_get.call_args[0][0]
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"items": []}}
        client.define.standards.list()
        assert "/governance/standards" in mock_get.call_args[0][0]
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {"success": True, "data": {"contract_id": "c1"}}
        result = client.define.data_contracts.create({"data_product_id": "dp1", "name": "x"})
        assert result["contract_id"] == "c1"
        mock_post.assert_called_once_with("/dataproducts/datacontracts", {"data_product_id": "dp1", "name": "x"})
    client.close()


def test_thesaurus_resolve_canonical_key_matches_alias():
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org1")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {"terms": [{"canonical_key": "customer_id", "aliases": [{"path": "cust_id"}]}]},
        }
        assert client.meaning.thesaurus.resolve_canonical_key("cust_id") == "customer_id"
        assert client.meaning.thesaurus.resolve_canonical_key("CUSTOMER_ID") == "customer_id"
        assert client.meaning.thesaurus.resolve_canonical_key("nope") is None
    client.close()


def test_workflows_list_returns_data():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "items": [{"workflow_id": "w1", "name": "Workflow 1", "project_id": "proj-1"}],
                "pagination": {"page": 1, "page_size": 50, "total": 1, "total_pages": 1},
            },
        }
        result = client.build.workflows.list(project_id="proj-1", page_size=50)
    assert "items" in result
    assert len(result["items"]) == 1
    assert result["items"][0]["name"] == "Workflow 1"
    client.close()


def test_observe_status_returns_data():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"bots": []}}
        result = client.observe.status()
    assert result == {"bots": []}
    client.close()


def test_projects_list_returns_data():
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
        result = client.workspace.projects.list(page_size=50)
    assert "items" in result
    assert len(result["items"]) == 1
    assert result["items"][0]["name"] == "Project 1"
    assert "pagination" in result
    client.close()


def test_projects_get_returns_data():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {"project_id": "p1", "name": "Project 1", "status": "active"},
        }
        result = client.workspace.projects.get("p1")
    assert result["project_id"] == "p1"
    assert result["name"] == "Project 1"
    client.close()
