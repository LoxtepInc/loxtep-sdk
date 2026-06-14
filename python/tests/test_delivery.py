"""Tests for the delivery namespace and DeliveryInterface model."""

from unittest.mock import patch

import pytest

from loxtep import (
    AsyncLoxtepClient,
    DeliveryInterface,
    DeliveryType,
    LoxtepClient,
)
from loxtep.delivery import AsyncDeliveryApi, DeliveryApi


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


def test_delivery_interface_model_creation():
    """DeliveryInterface can be created with all required fields."""
    di = DeliveryInterface(
        consumption_id="cons_123",
        data_product_id="dp_456",
        organization_id="org_789",
        delivery_type="webhook",
    )
    assert di.consumption_id == "cons_123"
    assert di.data_product_id == "dp_456"
    assert di.organization_id == "org_789"
    assert di.delivery_type == "webhook"
    assert di.is_active is True
    assert di.method == "POST"
    assert di.status == "active"
    assert di.headers == {}
    assert di.filters == {}
    assert di.configuration == {}
    assert di.metadata == {}


def test_delivery_interface_model_all_fields():
    """DeliveryInterface accepts all optional fields."""
    di = DeliveryInterface(
        consumption_id="cons_abc",
        data_product_id="dp_def",
        organization_id="org_ghi",
        delivery_type="api_endpoint",
        delivery_method="rest",
        status="paused",
        is_active=False,
        endpoint_url="https://example.com/api",
        method="GET",
        name="My API Endpoint",
        description="Generated REST API",
        headers={"Authorization": "Bearer xxx"},
        filters={"event_type": "order.created"},
        configuration={"rate_limit": 100},
        metadata={"created_by": "admin"},
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-06-01T12:00:00Z",
    )
    assert di.delivery_type == "api_endpoint"
    assert di.endpoint_url == "https://example.com/api"
    assert di.is_active is False
    assert di.name == "My API Endpoint"


def test_delivery_interface_allows_extra_fields():
    """DeliveryInterface allows extra fields (model_config extra='allow')."""
    di = DeliveryInterface(
        consumption_id="cons_1",
        data_product_id="dp_1",
        organization_id="org_1",
        delivery_type="export",
        custom_field="extra_value",
    )
    assert di.model_extra.get("custom_field") == "extra_value"


# ---------------------------------------------------------------------------
# Client property tests
# ---------------------------------------------------------------------------


def test_sync_client_has_delivery_property():
    """LoxtepClient exposes a delivery property of type DeliveryApi."""
    client = LoxtepClient(api_url="https://api.example.com")
    assert isinstance(client.delivery, DeliveryApi)
    client.close()


def test_async_client_has_delivery_property():
    """AsyncLoxtepClient exposes a delivery property of type AsyncDeliveryApi."""
    client = AsyncLoxtepClient(api_url="https://api.example.com")
    assert isinstance(client.delivery, AsyncDeliveryApi)


# ---------------------------------------------------------------------------
# DeliveryApi method tests (sync, mocked HTTP)
# ---------------------------------------------------------------------------


def test_delivery_list_returns_delivery_interfaces():
    """delivery.list parses response into DeliveryInterface models."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": [
                {
                    "consumption_id": "cons_1",
                    "data_product_id": "dp_1",
                    "organization_id": "org_1",
                    "delivery_type": "webhook",
                    "delivery_method": "http",
                    "status": "active",
                    "is_active": True,
                    "endpoint_url": "https://hook.example.com",
                    "method": "POST",
                    "name": "Order webhook",
                    "description": None,
                    "headers": {},
                    "filters": {},
                    "configuration": {},
                    "metadata": {},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                }
            ],
        }
        result = client.delivery.list("dp_1")

    assert len(result) == 1
    assert isinstance(result[0], DeliveryInterface)
    assert result[0].consumption_id == "cons_1"
    assert result[0].delivery_type == "webhook"
    mock_get.assert_called_once_with("/dataproducts/dp_1/consumptions?page=1&page_size=20")
    client.close()


def test_delivery_list_with_filters():
    """delivery.list passes status and is_active filters in query string."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": []}
        client.delivery.list("dp_1", status="active", is_active=True, page=2, page_size=10)

    call_url = mock_get.call_args[0][0]
    assert "page=2" in call_url
    assert "page_size=10" in call_url
    assert "status=active" in call_url
    assert "is_active=true" in call_url
    client.close()


def test_delivery_get_returns_delivery_interface():
    """delivery.get parses a single delivery interface response."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "consumption_id": "cons_42",
                "data_product_id": "dp_1",
                "organization_id": "org_1",
                "delivery_type": "export",
                "delivery_method": "s3",
                "status": "active",
                "is_active": True,
                "endpoint_url": None,
                "method": "POST",
                "name": "Daily export",
                "description": "CSV export to S3",
                "headers": {},
                "filters": {},
                "configuration": {"format": "csv", "bucket": "my-bucket"},
                "metadata": {},
                "created_at": "2024-03-01T00:00:00Z",
                "updated_at": "2024-03-01T00:00:00Z",
            },
        }
        result = client.delivery.get("dp_1", "cons_42")

    assert isinstance(result, DeliveryInterface)
    assert result.consumption_id == "cons_42"
    assert result.delivery_type == "export"
    assert result.configuration == {"format": "csv", "bucket": "my-bucket"}
    mock_get.assert_called_once_with("/dataproducts/dp_1/consumptions/cons_42")
    client.close()


def test_delivery_create_posts_body_and_returns_model():
    """delivery.create sends POST with delivery_type and returns DeliveryInterface."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {
            "success": True,
            "data": {
                "consumption_id": "cons_new",
                "data_product_id": "dp_1",
                "organization_id": "org_1",
                "delivery_type": "webhook",
                "delivery_method": "http",
                "status": "active",
                "is_active": True,
                "endpoint_url": "https://hook.example.com",
                "method": "POST",
                "name": None,
                "description": None,
                "headers": {"X-Secret": "abc"},
                "filters": {},
                "configuration": {},
                "metadata": {},
                "created_at": "2024-06-01T00:00:00Z",
                "updated_at": "2024-06-01T00:00:00Z",
            },
        }
        result = client.delivery.create(
            "dp_1",
            delivery_type="webhook",
            endpoint_url="https://hook.example.com",
            method="POST",
            headers={"X-Secret": "abc"},
        )

    assert isinstance(result, DeliveryInterface)
    assert result.consumption_id == "cons_new"
    assert result.delivery_type == "webhook"
    mock_post.assert_called_once_with(
        "/dataproducts/dp_1/consumptions",
        {
            "delivery_type": "webhook",
            "endpoint_url": "https://hook.example.com",
            "method": "POST",
            "headers": {"X-Secret": "abc"},
        },
    )
    client.close()


def test_delivery_update_puts_body_and_returns_model():
    """delivery.update sends PUT with kwargs and returns updated DeliveryInterface."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "put") as mock_put:
        mock_put.return_value = {
            "success": True,
            "data": {
                "consumption_id": "cons_1",
                "data_product_id": "dp_1",
                "organization_id": "org_1",
                "delivery_type": "webhook",
                "delivery_method": "http",
                "status": "paused",
                "is_active": False,
                "endpoint_url": "https://hook.example.com",
                "method": "POST",
                "name": "Updated webhook",
                "description": None,
                "headers": {},
                "filters": {},
                "configuration": {},
                "metadata": {},
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-06-15T00:00:00Z",
            },
        }
        result = client.delivery.update("dp_1", "cons_1", is_active=False, status="paused", name="Updated webhook")

    assert isinstance(result, DeliveryInterface)
    assert result.is_active is False
    assert result.status == "paused"
    assert result.name == "Updated webhook"
    mock_put.assert_called_once_with(
        "/dataproducts/dp_1/consumptions/cons_1",
        {"is_active": False, "status": "paused", "name": "Updated webhook"},
    )
    client.close()


def test_delivery_delete_calls_http_delete():
    """delivery.delete sends DELETE and returns None."""
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "delete") as mock_delete:
        mock_delete.return_value = None
        result = client.delivery.delete("dp_1", "cons_1")

    assert result is None
    mock_delete.assert_called_once_with("/dataproducts/dp_1/consumptions/cons_1")
    client.close()
