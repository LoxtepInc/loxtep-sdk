"""data_products.iceberg — parity with nodejs/src/client/data-products.ts iceberg namespace."""

from unittest.mock import AsyncMock, patch

import pytest

from loxtep import AsyncLoxtepClient, LoxtepClient
from loxtep.errors import ValidationError

DP = "63dc54dc-6bac-4b0d-ab94-9bca45322f9b"
BASE = f"/dataproducts/{DP}"
EID = "z/2026/11/13/08/30/1731486600000-0000001"


def test_namespace_exposes_the_node_methods():
    client = LoxtepClient(api_url="https://api.example.com")
    for name in (
        "rebuild",
        "health",
        "status",
        "cancel",
        "enable",
        "put_config",
        "files",
        "snapshots",
        "set_history",
        "set_indexes",
        "trace",
    ):
        assert callable(getattr(client.build.data_products.iceberg, name))
    client.close()


def test_read_routes_and_unwrap():
    client = LoxtepClient(api_url="https://api.example.com")
    api = client.build.data_products.iceberg
    with patch.object(client._http, "get", return_value={"data": {"ok": 1}}) as get:
        assert api.health(DP) == {"ok": 1}
        get.assert_called_with(f"{BASE}/iceberg/health")
        api.status(DP)
        get.assert_called_with(f"{BASE}/iceberg")
        api.files(DP)
        get.assert_called_with(f"{BASE}/iceberg/files")
        api.snapshots(DP)
        get.assert_called_with(f"{BASE}/iceberg/snapshots")
    client.close()


def test_rebuild_requires_confirm_and_backfill_from():
    client = LoxtepClient(api_url="https://api.example.com")
    api = client.build.data_products.iceberg
    with patch.object(client._http, "post", return_value={"data": {"job_id": "j"}}) as post:
        with pytest.raises(ValidationError, match="confirm"):
            api.rebuild(DP, {"backfill_from": "z/"})
        with pytest.raises(ValidationError, match="backfill_from"):
            api.rebuild(DP, {"confirm": True})
        post.assert_not_called()
        assert api.rebuild(DP, {"confirm": True, "backfill_from": "z/", "dry_run": True}) == {"job_id": "j"}
        post.assert_called_once_with(
            f"{BASE}/iceberg/rebuild", {"confirm": True, "backfill_from": "z/", "dry_run": True}
        )
    client.close()


def test_set_history_puts_only_history_enabled():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as get, patch.object(
        client._http, "put", return_value={"data": {}}
    ) as put:
        result = client.build.data_products.iceberg.set_history(DP, True)
    get.assert_not_called()
    put.assert_called_once_with(
        BASE, {"metadata": {"storage_indexing_preferences": {"history_enabled": True}}}
    )
    assert result == {"data_product_id": DP, "history_enabled": True}
    client.close()


def test_set_history_off_needs_confirm_true():
    client = LoxtepClient(api_url="https://api.example.com")
    api = client.build.data_products.iceberg
    with patch.object(client._http, "put", return_value={}) as put:
        with pytest.raises(ValidationError, match="confirm=True"):
            api.set_history(DP, False)
        with pytest.raises(ValidationError, match="confirm=True"):
            api.set_history(DP, False, confirm="yes")
        put.assert_not_called()
        api.set_history(DP, False, confirm=True)
        put.assert_called_once_with(
            BASE, {"metadata": {"storage_indexing_preferences": {"history_enabled": False}}}
        )
    client.close()


def test_set_indexes_puts_only_what_is_passed():
    client = LoxtepClient(api_url="https://api.example.com")
    api = client.build.data_products.iceberg
    with patch.object(client._http, "put", return_value={}) as put:
        assert api.set_indexes(DP, bloom_filter_columns=["id"]) == {
            "data_product_id": DP,
            "bloom_filter_columns": ["id"],
        }
        put.assert_called_with(BASE, {"metadata": {"storage_indexing_preferences": {"bloom_filter_columns": ["id"]}}})
        api.set_indexes(DP, analytics_indexes_enabled=False, row_embeddings=None)
        put.assert_called_with(
            BASE,
            {"metadata": {"storage_indexing_preferences": {"analytics_indexes_enabled": False, "row_embeddings": None}}},
        )
        api.set_indexes(DP, row_embeddings={"fields": ["title"], "dimensions": 512})
        put.assert_called_with(
            BASE,
            {"metadata": {"storage_indexing_preferences": {"row_embeddings": {"fields": ["title"], "dimensions": 512}}}},
        )
    client.close()


def test_set_indexes_rejects_empty_and_too_many_bloom_columns():
    client = LoxtepClient(api_url="https://api.example.com")
    api = client.build.data_products.iceberg
    with patch.object(client._http, "put") as put:
        with pytest.raises(ValidationError, match="at least one"):
            api.set_indexes(DP)
        with pytest.raises(ValidationError, match="at most 20"):
            api.set_indexes(DP, bloom_filter_columns=[f"c{i}" for i in range(21)])
        put.assert_not_called()
    client.close()


def test_trace_builds_query_and_validates():
    client = LoxtepClient(api_url="https://api.example.com")
    api = client.build.data_products.iceberg
    trace = {"data_product_id": DP, "eid": EID, "steps": [], "stops": [{"depth": 0, "reason": "no_upstream"}]}
    with patch.object(client._http, "get", return_value={"success": True, "data": trace}) as get:
        assert api.trace(DP, EID, max_hops=3) == trace
        path = get.call_args.args[0]
        assert path.startswith(f"{BASE}/iceberg/trace?")
        assert "eid=z%2F2026%2F11%2F13%2F08%2F30%2F1731486600000-0000001" in path
        assert "max_hops=3" in path and "max_rows" not in path
        get.reset_mock()
        with pytest.raises(ValidationError, match="z/"):
            api.trace(DP, "z/1' OR 1=1")
        with pytest.raises(ValidationError, match="z/"):
            api.trace(DP, "z/1\n")
        with pytest.raises(ValidationError, match="max_rows"):
            api.trace(DP, EID, max_rows=500)
        with pytest.raises(ValidationError, match="max_hops"):
            api.trace(DP, EID, max_hops=True)
        get.assert_not_called()
    client.close()


@pytest.mark.asyncio
async def test_async_set_history_and_trace():
    client = AsyncLoxtepClient(api_url="https://api.example.com", organization_id="org1")
    api = client.build.data_products.iceberg
    with patch.object(client._http, "put", new=AsyncMock(return_value={"data": {}})) as put:
        assert await api.set_history(DP, False, confirm=True) == {
            "data_product_id": DP,
            "history_enabled": False,
        }
        put.assert_awaited_once_with(
            BASE, {"metadata": {"storage_indexing_preferences": {"history_enabled": False}}}
        )
    with patch.object(
        client._http, "get", new=AsyncMock(return_value={"data": {"steps": [], "stops": []}})
    ) as get:
        assert await api.trace(DP, EID) == {"steps": [], "stops": []}
        assert get.await_args.args[0].startswith(f"{BASE}/iceberg/trace?eid=")
    with patch.object(client._http, "put", new=AsyncMock(return_value={})) as put:
        assert await api.set_indexes(DP, analytics_indexes_enabled=True) == {
            "data_product_id": DP,
            "analytics_indexes_enabled": True,
        }
        put.assert_awaited_once()
    await client.aclose()
