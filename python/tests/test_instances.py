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
