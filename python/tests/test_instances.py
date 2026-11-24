"""Instances API path contract."""

from unittest.mock import MagicMock

from loxtep.instances import (
    InstancesApi,
    build_instance_update_body,
    normalize_writable_environment_key,
)


def test_get_stream_config_uses_organizations_path():
    http = MagicMock()
    http.get.return_value = {"success": True, "data": {"LeoCron": "test-LeoCron"}}
    api = InstancesApi(http)
    out = api.get_stream_config("abc")
    http.get.assert_called_once_with("/organizations/instances/abc/stream-config")
    assert out["LeoCron"] == "test-LeoCron"


def test_update_puts_connector_vpc():
    http = MagicMock()
    http.put.return_value = {"success": True, "data": {"instance_id": "abc"}}
    api = InstancesApi(http)
    out = api.update("abc", {"connection_details": {"connector_vpc": {"subnet_ids": ["subnet-aaaabbbb", "subnet-ccccdddd"], "security_group_id": "sg-eeeeffff"}}})
    http.put.assert_called_once()
    args, kwargs = http.put.call_args
    assert args[0] == "/organizations/instances/abc"
    assert "connector_vpc" in args[1]["connection_details"]
    assert out["instance_id"] == "abc"


def test_redeploy_runtimes_puts_force_flag():
    http = MagicMock()
    http.put.return_value = {"success": True, "data": {"instance_id": "abc"}}
    api = InstancesApi(http)
    api.redeploy_runtimes("abc")
    args, _ = http.put.call_args
    assert args[1] == {"force_runtimes_redeploy": True}


def test_normalize_writable_environment_key():
    assert normalize_writable_environment_key("  Denver-Franchise  ") == "denver-franchise"
    assert normalize_writable_environment_key("staging") == "stage"
    assert normalize_writable_environment_key("Production") == "prod"
    assert normalize_writable_environment_key("") is None
    assert normalize_writable_environment_key(None) is None


def test_build_instance_update_body_maps_environment_key():
    assert build_instance_update_body({"environment_key": "Stage"}) == {
        "metadata": {"environment_key": "stage"}
    }
    assert build_instance_update_body({"environment_key": None}) == {
        "metadata": {"environment_key": None}
    }
    assert build_instance_update_body(
        {"metadata": {"environment_key": "denver-franchise", "keep": True}}
    ) == {"metadata": {"environment_key": "denver-franchise", "keep": True}}


def test_update_puts_environment_key_into_metadata():
    http = MagicMock()
    http.put.return_value = {"success": True, "data": {"instance_id": "abc"}}
    api = InstancesApi(http)
    api.update("abc", {"environment_key": "denver-franchise"})
    args, _ = http.put.call_args
    assert args[1] == {"metadata": {"environment_key": "denver-franchise"}}
