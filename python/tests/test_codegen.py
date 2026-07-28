"""
Tests for codegen.py — Python port of nodejs/src/codegen/{normalize,emit,write-artifact}.ts
(load-workspace-context.ts is exercised indirectly via test_cli_generate.py with a mocked
client, since it's pure I/O).
"""

from unittest.mock import patch

from loxtep.codegen import (
    compute_counts,
    derive_key,
    emit_artifact,
    normalize_context,
    write_artifact,
)


def test_derive_key_lowercases_and_replaces_non_alnum():
    assert derive_key("Order Webhook") == "order_webhook"
    assert derive_key("shopify_gql_customer") == "shopify_gql_customer"
    assert derive_key("--!!--") == "_"
    assert derive_key("123abc") == "_123abc"
    assert derive_key("") == "_"


def _ctx(**overrides):
    base = {
        "data_products": [],
        "connectors": [],
        "domains": [],
        "queues": [],
        "flows": [],
        "workflows": [],
    }
    base.update(overrides)
    return base


def test_normalize_context_sorts_by_id_and_resolves_key_collisions():
    ctx = _ctx(
        data_products=[
            {"name": "Orders", "id": "b", "domain": None, "schema": None},
            {"name": "Orders", "id": "a", "domain": None, "schema": None},
        ]
    )
    norm = normalize_context(ctx)
    dps = norm["data_products"]
    # sorted by id ascending: "a" first, then "b"
    assert dps[0].data["id"] == "a"
    assert dps[0].key == "orders"
    assert dps[1].data["id"] == "b"
    assert dps[1].key == "orders_2"


def test_emit_artifact_produces_valid_python_source():
    ctx = _ctx(
        data_products=[{"name": "Orders", "id": "dp_1", "domain": "dom_1", "schema": {}}],
        connectors=[{"name": "Shopify", "type": "shopify", "id": "conn_1", "connection_id": None}],
    )
    norm = normalize_context(ctx)
    source = emit_artifact(norm)

    assert "AUTO-GENERATED" in source
    assert "DATA_PRODUCTS" in source
    assert "CONNECTORS" in source
    assert "WORKSPACE" in source

    namespace: dict = {}
    exec(source, namespace)  # noqa: S102 - verifying the emitted source is valid Python
    assert namespace["DATA_PRODUCTS"]["orders"]["id"] == "dp_1"
    assert namespace["CONNECTORS"]["shopify"]["type"] == "shopify"
    assert namespace["WORKSPACE"]["data_products"] is namespace["DATA_PRODUCTS"]


def test_emit_artifact_empty_collections_render_empty_dict():
    norm = normalize_context(_ctx())
    source = emit_artifact(norm)
    namespace: dict = {}
    exec(source, namespace)  # noqa: S102
    assert namespace["DATA_PRODUCTS"] == {}
    assert namespace["WORKSPACE"]["workflows"] == {}


def test_compute_counts():
    ctx = _ctx(
        data_products=[{"name": "a", "id": "1", "domain": None, "schema": None}],
        domains=[{"name": "d", "id": "2", "data_product_ids": []}],
    )
    norm = normalize_context(ctx)
    counts = compute_counts(norm)
    assert counts["data_products"] == 1
    assert counts["domains"] == 1
    assert counts["connectors"] == 0


def test_write_artifact_writes_atomically_and_returns_counts(tmp_path):
    ctx = _ctx(data_products=[{"name": "Orders", "id": "dp_1", "domain": None, "schema": None}])
    norm = normalize_context(ctx)
    source = emit_artifact(norm)
    target = tmp_path / ".loxtep" / "generated" / "__init__.py"

    counts = write_artifact(str(target), source, norm)

    assert target.exists()
    assert target.read_text(encoding="utf-8") == source
    assert counts["data_products"] == 1
    # no leftover temp files
    assert list(target.parent.glob(".loxtep-gen-*.tmp")) == []


def test_write_artifact_cleans_up_temp_file_on_failure(tmp_path):
    ctx = _ctx()
    norm = normalize_context(ctx)
    source = emit_artifact(norm)
    target = tmp_path / ".loxtep" / "generated" / "__init__.py"

    with patch("pathlib.Path.replace", side_effect=OSError("disk full")):
        try:
            write_artifact(str(target), source, norm)
            assert False, "expected OSError"
        except OSError:
            pass

    assert not target.exists()
    assert list(target.parent.glob(".loxtep-gen-*.tmp")) == []
