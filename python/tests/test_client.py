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
    assert client.flows is not None
    assert client.workflows is not None
    assert client.observe is not None
    assert client.connections is not None
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


def test_workflows_list_workflows_returns_data():
    """list_workflows returns response data when get is mocked."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "items": [{"workflow_id": "w1", "name": "Flow 1", "project_id": "proj-1"}],
                "pagination": {"page": 1, "page_size": 50, "total": 1, "total_pages": 1},
            },
        }
        result = client.workflows.list_workflows(project_id="proj-1", page_size=50)
    assert "items" in result
    assert len(result["items"]) == 1
    assert result["items"][0]["name"] == "Flow 1"
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
        result = client.projects.list_projects(page_size=50)
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
        result = client.projects.get_project("p1")
    assert result["project_id"] == "p1"
    assert result["name"] == "Project 1"
    client.close()
