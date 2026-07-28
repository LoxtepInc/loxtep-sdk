"""
Tests for DataProductsApi.query()/list_tables() — these moved off the API-key-only
`/dataproducts/query` and `/dataproducts/{id}/tables` routes onto the JWT-compatible
warehouse routes, matching nodejs/src/client/data-products.ts.
"""

from unittest.mock import patch

from loxtep import LoxtepClient


def test_query_calls_warehouse_execute_and_normalizes_rows():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {
            "success": True,
            "data": {
                "status": "success",
                "rows": [{"id": 1}, {"id": 2}],
                "row_count": 2,
                "total_count": 2,
                "execution_time_ms": 42,
            },
        }
        result = client.build.data_products.query("dp_1", "SELECT 1")

    mock_post.assert_called_once_with(
        "/dataproducts/warehouse/execute", {"sql": "SELECT 1", "data_product_ids_hint": ["dp_1"]}
    )
    assert result["items"] == [{"id": 1}, {"id": 2}]
    assert result["metadata"]["data_product_id"] == "dp_1"
    assert result["metadata"]["returned_rows"] == 2
    assert result["metadata"]["query_time_ms"] == 42
    client.close()


def test_query_raises_on_failed_status():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {"success": True, "data": {"status": "failed", "error": "bad sql"}}
        try:
            client.build.data_products.query("dp_1", "SELECT bad")
            assert False, "expected RuntimeError"
        except RuntimeError as e:
            assert "bad sql" in str(e)
    client.close()


def test_list_tables_calls_warehouse_tables_and_filters_by_data_product():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "tables": [
                    {"name": "orders", "sql_name": "silver_orders", "data_product_id": "dp_1", "medallion": "silver"},
                    {"name": "customers", "sql_name": "silver_customers", "data_product_id": "dp_2"},
                ]
            },
        }
        result = client.build.data_products.list_tables("dp_1")

    mock_get.assert_called_once_with("/dataproducts/warehouse/tables")
    assert len(result["items"]) == 1
    # Matches nodejs/src/client/data-products.ts exactly: the computed `name` (sql_name ?? name)
    # is immediately overwritten by the later `...t` spread, so the raw `t.name` wins in practice.
    # This is a real quirk in Node's own code, faithfully replicated here rather than "fixed".
    assert result["items"][0]["name"] == "orders"
    assert result["items"][0]["schema"] == "silver"
    client.close()
