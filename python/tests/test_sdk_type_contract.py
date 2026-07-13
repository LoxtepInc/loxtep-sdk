"""
SDK Type-Contract Tests — Property 11: SdkTypeContractInvariant (Python)

Feature: source-consumer-navigation, Property 11: SdkTypeContractInvariant

**Validates: Requirements 8.1, 8.3**

These tests assert that:
1. The Python SDK's DataProduct Pydantic model requires `kind` as a field
   with type Literal['source', 'consumer'].
2. Instantiating DataProduct from API output that omits `kind` raises ValidationError.
3. The create method signature requires `kind` as a keyword argument.
4. Invalid `kind` values are rejected by the Pydantic model.
"""

import inspect
from typing import get_type_hints

import pytest
from pydantic import ValidationError

from loxtep import DataProduct, DataProductKind, UsageMapEdge, UsageMapNode
from loxtep.data_products import DataProductsApi


class TestDataProductKindRequired:
    """DataProduct Pydantic model requires `kind` field — Requirement 8.1."""

    def test_data_product_without_kind_raises_validation_error(self):
        """API output missing `kind` raises ValidationError."""
        raw_api_response = {
            "dataProductId": "dp-100",
            "name": "Orders",
            "description": "Order events",
            "domain": "commerce",
            "status": "active",
            # kind is intentionally omitted
        }
        with pytest.raises(ValidationError) as exc_info:
            DataProduct.model_validate(raw_api_response)

        # Verify the error mentions 'kind'
        errors = exc_info.value.errors()
        kind_errors = [e for e in errors if "kind" in str(e.get("loc", []))]
        assert len(kind_errors) > 0, "ValidationError should reference the 'kind' field"

    def test_data_product_with_null_kind_raises_validation_error(self):
        """API output with kind=null raises ValidationError."""
        raw_api_response = {
            "dataProductId": "dp-101",
            "name": "Orders",
            "kind": None,
        }
        with pytest.raises(ValidationError):
            DataProduct.model_validate(raw_api_response)

    def test_data_product_with_invalid_kind_raises_validation_error(self):
        """API output with kind='invalid' raises ValidationError."""
        raw_api_response = {
            "dataProductId": "dp-102",
            "name": "Orders",
            "kind": "invalid",
        }
        with pytest.raises(ValidationError):
            DataProduct.model_validate(raw_api_response)

    def test_data_product_with_empty_string_kind_raises_validation_error(self):
        """API output with kind='' raises ValidationError."""
        raw_api_response = {
            "dataProductId": "dp-103",
            "name": "Orders",
            "kind": "",
        }
        with pytest.raises(ValidationError):
            DataProduct.model_validate(raw_api_response)

    def test_data_product_with_source_kind_succeeds(self):
        """API output with kind='source' validates successfully."""
        raw_api_response = {
            "dataProductId": "dp-200",
            "name": "Orders",
            "kind": "source",
        }
        dp = DataProduct.model_validate(raw_api_response)
        assert dp.kind == "source"
        assert dp.data_product_id == "dp-200"

    def test_data_product_with_consumer_kind_succeeds(self):
        """API output with kind='consumer' validates successfully."""
        raw_api_response = {
            "dataProductId": "dp-201",
            "name": "Dashboard",
            "kind": "consumer",
        }
        dp = DataProduct.model_validate(raw_api_response)
        assert dp.kind == "consumer"

    def test_data_product_kind_field_is_required_in_schema(self):
        """The Pydantic model schema marks `kind` as required (no default)."""
        schema = DataProduct.model_json_schema()
        required_fields = schema.get("required", [])
        assert "kind" in required_fields, f"'kind' must be in required fields, got: {required_fields}"


class TestCreateDataProductKindRequired:
    """create method requires `kind` keyword argument — Requirement 8.3."""

    def test_create_signature_has_kind_parameter(self):
        """The create method has a `kind` parameter."""
        sig = inspect.signature(DataProductsApi.create)
        params = sig.parameters
        assert "kind" in params, f"'kind' must be a parameter, got: {list(params.keys())}"

    def test_create_kind_is_keyword_only(self):
        """The `kind` parameter is keyword-only (cannot be passed positionally)."""
        sig = inspect.signature(DataProductsApi.create)
        kind_param = sig.parameters["kind"]
        assert kind_param.kind == inspect.Parameter.KEYWORD_ONLY, (
            f"'kind' should be KEYWORD_ONLY, got: {kind_param.kind.name}"
        )

    def test_create_kind_has_no_default(self):
        """The `kind` parameter has no default value (it is required)."""
        sig = inspect.signature(DataProductsApi.create)
        kind_param = sig.parameters["kind"]
        assert kind_param.default is inspect.Parameter.empty, (
            f"'kind' should have no default, got: {kind_param.default}"
        )

    def test_create_kind_type_annotation(self):
        """The `kind` parameter is annotated with DataProductKind type."""
        hints = get_type_hints(DataProductsApi.create)
        assert "kind" in hints, f"'kind' must have a type annotation, got hints: {list(hints.keys())}"
        # The annotation should be DataProductKind (Literal['source', 'consumer'])
        assert hints["kind"] is DataProductKind, (
            f"'kind' annotation should be DataProductKind, got: {hints['kind']}"
        )


class TestUsageMapNodeKindRequired:
    """UsageMapNode Pydantic model requires `kind` field."""

    def test_usage_map_node_without_kind_raises_validation_error(self):
        """UsageMapNode missing `kind` raises ValidationError."""
        with pytest.raises(ValidationError):
            UsageMapNode.model_validate({"id": "dp-1", "name": "Orders", "fanout": 2})

    def test_usage_map_node_with_invalid_kind_raises_validation_error(self):
        """UsageMapNode with invalid kind raises ValidationError."""
        with pytest.raises(ValidationError):
            UsageMapNode.model_validate({"id": "dp-1", "kind": "bad", "name": "Orders", "fanout": 2})

    def test_usage_map_node_with_valid_kind_succeeds(self):
        """UsageMapNode with valid kind validates successfully."""
        node = UsageMapNode.model_validate({"id": "dp-1", "kind": "source", "name": "Orders", "fanout": 3})
        assert node.kind == "source"

    def test_usage_map_node_kind_field_is_required_in_schema(self):
        """The Pydantic model schema marks `kind` as required."""
        schema = UsageMapNode.model_json_schema()
        required_fields = schema.get("required", [])
        assert "kind" in required_fields


class TestUsageMapEdgeContract:
    """UsageMapEdge Pydantic model contract tests."""

    def test_usage_map_edge_requires_source_target_projection(self):
        """UsageMapEdge requires source, target, and projection_spec_id."""
        with pytest.raises(ValidationError):
            UsageMapEdge.model_validate({"source": "dp-1"})

    def test_usage_map_edge_valid(self):
        """UsageMapEdge with all required fields validates."""
        edge = UsageMapEdge.model_validate(
            {"source": "dp-1", "target": "dp-2", "projection_spec_id": "ps-1"}
        )
        assert edge.source == "dp-1"
        assert edge.target == "dp-2"
        assert edge.projection_spec_id == "ps-1"
