"""
Port of nodejs/src/config/platform-request-url.test.ts — keep test cases in sync.
"""

import os

from loxtep.gateway_url import build_platform_request_url, get_gateway_microservice_id

HOST = "https://apidev.example.com"


def test_maps_first_path_segment_before_overrides():
    assert get_gateway_microservice_id("/workflows/x") == "workflows"
    assert get_gateway_microservice_id("/dataproducts") == "dataproducts"


def test_prefixes_dataproducts_paths_with_the_dataproducts_microservice():
    assert (
        build_platform_request_url(HOST, "/dataproducts")
        == "https://apidev.example.com/dataproducts/dataproducts"
    )


def test_doubles_dataproducts_for_the_dataproducts_resource_itself():
    assert (
        build_platform_request_url(HOST, "/dataproducts/11111111-1111-1111-1111-111111111111")
        == "https://apidev.example.com/dataproducts/dataproducts/11111111-1111-1111-1111-111111111111"
    )
    assert (
        build_platform_request_url(HOST, "/dataproducts/usage-map")
        == "https://apidev.example.com/dataproducts/dataproducts/usage-map"
    )


def test_does_not_double_dataproducts_for_sibling_resources():
    assert (
        build_platform_request_url(HOST, "/dataproducts/datacontracts")
        == "https://apidev.example.com/dataproducts/datacontracts"
    )
    assert (
        build_platform_request_url(HOST, "/dataproducts/quality-metrics")
        == "https://apidev.example.com/dataproducts/quality-metrics"
    )
    assert (
        build_platform_request_url(HOST, "/dataproducts/templates")
        == "https://apidev.example.com/dataproducts/templates"
    )
    assert (
        build_platform_request_url(HOST, "/dataproducts/warehouse/tables")
        == "https://apidev.example.com/dataproducts/warehouse/tables"
    )
    assert (
        build_platform_request_url(HOST, "/dataproducts/warehouse/execute")
        == "https://apidev.example.com/dataproducts/warehouse/execute"
    )


def test_does_not_double_prefix_when_path_already_has_microservice_and_more_segments():
    assert (
        build_platform_request_url(HOST, "/workflows/projects")
        == "https://apidev.example.com/workflows/projects"
    )


def test_does_not_double_prefix_ai_and_graph():
    assert build_platform_request_url(HOST, "/ai/mcp/x") == "https://apidev.example.com/ai/mcp/x"
    assert (
        build_platform_request_url(HOST, "/graph/organizations/x")
        == "https://apidev.example.com/graph/organizations/x"
    )


def test_routes_observe_and_rate_limits_through_app():
    assert (
        build_platform_request_url(HOST, "/observe/bots")
        == "https://apidev.example.com/app/observe/bots"
    )
    assert (
        build_platform_request_url(HOST, "/rate-limits")
        == "https://apidev.example.com/app/rate-limits"
    )


def test_maps_search_via_env_var_default_graph(monkeypatch):
    monkeypatch.delenv("LOXTEP_PLATFORM_SEARCH_MS", raising=False)
    assert build_platform_request_url(HOST, "/search") == "https://apidev.example.com/graph/search"
    monkeypatch.setenv("LOXTEP_PLATFORM_SEARCH_MS", "search")
    assert build_platform_request_url(HOST, "/search") == "https://apidev.example.com/search/search"


def test_routes_organizations_instance_apis_without_duplicating_prefix():
    assert (
        build_platform_request_url(HOST, "/organizations/instances/abc/stream-config")
        == "https://apidev.example.com/organizations/instances/abc/stream-config"
    )


def test_does_not_treat_bare_instances_as_organizations():
    assert (
        build_platform_request_url(HOST, "/instances/abc/stream-config")
        == "https://apidev.example.com/instances/abc/stream-config"
    )


def test_preserves_query_strings_on_the_built_url():
    assert (
        build_platform_request_url(HOST, "/organizations/domains?page_size=1")
        == "https://apidev.example.com/organizations/domains?page_size=1"
    )
    assert build_platform_request_url(
        HOST,
        "/dataproducts/x/contracts?data_product_id=11111111-1111-1111-1111-111111111111",
    ) == (
        "https://apidev.example.com/dataproducts/dataproducts/x/contracts"
        "?data_product_id=11111111-1111-1111-1111-111111111111"
    )
    assert (
        build_platform_request_url(HOST, "/ai/mcp/tools?limit=10")
        == "https://apidev.example.com/ai/mcp/tools?limit=10"
    )
    assert (
        build_platform_request_url(HOST, "/observe/bots?namespace=lx")
        == "https://apidev.example.com/app/observe/bots?namespace=lx"
    )
