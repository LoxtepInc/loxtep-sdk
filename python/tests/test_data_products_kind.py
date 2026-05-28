"""Tests for the DataProduct kind discriminator, create_data_product, list with kind filter, and get_usage_map."""

from unittest.mock import patch

import pytest

from loxtep import (
    DataProduct,
    DataProductKind,
    LoxtepClient,
    UsageMap,
    UsageMapEdge,
    UsageMapNode,
)


class TestDataProductModel:
    """Tests for the DataProduct Pydantic model."""

    def test_data_product_requires_kind(self):
        """DataProduct model requires kind field."""
        with pytest.raises(Exception):
            DataProduct(dataProductId="dp-1", name="Test")

    def test_data_product_accepts_source_kind(self):
        dp = DataProduct(dataProductId="dp-1", name="Orders", kind="source")
        assert dp.kind == "source"
        assert dp.data_product_id == "dp-1"

    def test_data_product_accepts_consumer_kind(self):
        dp = DataProduct(dataProductId="dp-2", name="Dashboard", kind="consumer")
        assert dp.kind == "consumer"

    def test_data_product_rejects_invalid_kind(self):
        with pytest.raises(Exception):
            DataProduct(dataProductId="dp-3", name="Bad", kind="invalid")

    def test_data_product_from_api_response(self):
        """DataProduct can be constructed from a typical API response dict."""
        raw = {
            "dataProductId": "dp-100",
            "name": "Customer 360",
            "description": "Unified customer view",
            "domain": "sales",
            "kind": "consumer",
            "status": "active",
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-06-15T12:00:00Z",
        }
        dp = DataProduct.model_validate(raw)
        assert dp.data_product_id == "dp-100"
        assert dp.kind == "consumer"
        assert dp.status == "active"


class TestUsageMapModels:
    """Tests for UsageMapNode and UsageMapEdge models."""

    def test_usage_map_node(self):
        node = UsageMapNode(id="dp-1", kind="source", name="Orders", fanout=3)
        assert node.id == "dp-1"
        assert node.kind == "source"
        assert node.fanout == 3

    def test_usage_map_edge(self):
        edge = UsageMapEdge(source="dp-1", target="dp-2", projection_spec_id="ps-1")
        assert edge.source == "dp-1"
        assert edge.target == "dp-2"

    def test_usage_map_full(self):
        data = {
            "nodes": [
                {"id": "dp-1", "kind": "source", "name": "Orders", "fanout": 2},
                {"id": "dp-2", "kind": "consumer", "name": "Dashboard", "fanout": 0},
            ],
            "edges": [
                {"source": "dp-1", "target": "dp-2", "projection_spec_id": "ps-1"},
            ],
        }
        usage_map = UsageMap.model_validate(data)
        assert len(usage_map.nodes) == 2
        assert len(usage_map.edges) == 1
        assert usage_map.nodes[0].kind == "source"
        assert usage_map.edges[0].source == "dp-1"


class TestCreateDataProduct:
    """Tests for the create_data_product method."""

    def test_create_data_product_sends_kind(self):
        client = LoxtepClient(api_url="https://api.example.com")
        with patch.object(client._http, "post") as mock_post:
            mock_post.return_value = {
                "success": True,
                "data": {
                    "dataProductId": "dp-new",
                    "name": "New Source",
                    "kind": "source",
                },
            }
            result = client.data_products.create_data_product(
                name="New Source",
                kind="source",
            )
        mock_post.assert_called_once_with(
            "/dataproducts",
            {"name": "New Source", "kind": "source", "description": "", "domain": ""},
        )
        assert result["kind"] == "source"
        client.close()

    def test_create_data_product_consumer_kind(self):
        client = LoxtepClient(api_url="https://api.example.com")
        with patch.object(client._http, "post") as mock_post:
            mock_post.return_value = {
                "success": True,
                "data": {
                    "dataProductId": "dp-new",
                    "name": "Dashboard",
                    "kind": "consumer",
                },
            }
            result = client.data_products.create_data_product(
                name="Dashboard",
                kind="consumer",
                description="A consumer DP",
                domain="analytics",
            )
        mock_post.assert_called_once_with(
            "/dataproducts",
            {"name": "Dashboard", "kind": "consumer", "description": "A consumer DP", "domain": "analytics"},
        )
        assert result["kind"] == "consumer"
        client.close()


class TestListDataProductsKindFilter:
    """Tests for the optional kind filter on list."""

    def test_list_without_kind_does_not_include_kind_param(self):
        client = LoxtepClient(api_url="https://api.example.com")
        with patch.object(client._http, "get") as mock_get:
            mock_get.return_value = {"data": {"items": []}}
            client.data_products.list()
        call_path = mock_get.call_args[0][0]
        assert "kind=" not in call_path
        client.close()

    def test_list_with_source_kind_includes_kind_param(self):
        client = LoxtepClient(api_url="https://api.example.com")
        with patch.object(client._http, "get") as mock_get:
            mock_get.return_value = {"data": {"items": []}}
            client.data_products.list(kind="source")
        call_path = mock_get.call_args[0][0]
        assert "kind=source" in call_path
        client.close()

    def test_list_with_consumer_kind_includes_kind_param(self):
        client = LoxtepClient(api_url="https://api.example.com")
        with patch.object(client._http, "get") as mock_get:
            mock_get.return_value = {"data": {"items": []}}
            client.data_products.list(kind="consumer")
        call_path = mock_get.call_args[0][0]
        assert "kind=consumer" in call_path
        client.close()


class TestGetUsageMap:
    """Tests for the get_usage_map method."""

    def test_get_usage_map_returns_typed_tuple(self):
        client = LoxtepClient(api_url="https://api.example.com")
        with patch.object(client._http, "get") as mock_get:
            mock_get.return_value = {
                "data": {
                    "nodes": [
                        {"id": "dp-1", "kind": "source", "name": "Orders", "fanout": 2},
                        {"id": "dp-2", "kind": "consumer", "name": "Dashboard", "fanout": 0},
                    ],
                    "edges": [
                        {"source": "dp-1", "target": "dp-2", "projection_spec_id": "ps-1"},
                    ],
                }
            }
            nodes, edges = client.data_products.get_usage_map()
        assert len(nodes) == 2
        assert len(edges) == 1
        assert isinstance(nodes[0], UsageMapNode)
        assert isinstance(edges[0], UsageMapEdge)
        assert nodes[0].kind == "source"
        assert nodes[1].kind == "consumer"
        assert edges[0].source == "dp-1"
        assert edges[0].target == "dp-2"
        client.close()

    def test_get_usage_map_empty(self):
        client = LoxtepClient(api_url="https://api.example.com")
        with patch.object(client._http, "get") as mock_get:
            mock_get.return_value = {"data": {"nodes": [], "edges": []}}
            nodes, edges = client.data_products.get_usage_map()
        assert nodes == []
        assert edges == []
        client.close()
