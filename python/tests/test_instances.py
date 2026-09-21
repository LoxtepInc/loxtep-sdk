"""Instances API path contract."""

from unittest.mock import MagicMock

from loxtep.instances import InstancesApi


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
