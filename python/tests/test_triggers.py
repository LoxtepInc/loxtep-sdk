"""Tests for the triggers namespace (workflow connection nodes) and Trigger model.

Mirrors nodejs/src/client/triggers.ts and test_targets.py's coverage shape.
"""

from unittest.mock import patch

import pytest

from loxtep import AsyncLoxtepClient, LoxtepClient, Trigger
from loxtep.triggers import AsyncTriggersApi, TriggersApi


def test_trigger_model_creation():
    t = Trigger(connection_id="conn_1", key="k1", name="My trigger", type="api")
    assert t.connection_id == "conn_1"
    assert t.status == "active"
    assert t.verified is False
    assert t.draft is True


def test_sync_client_has_triggers_property():
    client = LoxtepClient(api_url="https://api.example.com")
    assert isinstance(client.build.triggers, TriggersApi)
    client.close()


def test_async_client_has_triggers_property():
    client = AsyncLoxtepClient(api_url="https://api.example.com")
    assert isinstance(client.build.triggers, AsyncTriggersApi)


def test_triggers_list_requires_project_id():
    client = LoxtepClient(api_url="https://api.example.com")
    with pytest.raises(ValueError, match="requires project_id"):
        client.build.triggers.list()
    client.close()


def test_triggers_list_parses_connections_from_entities():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "connections": [
                    {
                        "connection_id": "conn_1",
                        "project_id": "proj_1",
                        "workflow_id": "wf_1",
                        "key": "source",
                        "name": "Orders API",
                        "type": "api",
                        "status": "active",
                        "created_at": "2024-01-01T00:00:00Z",
                        "updated_at": "2024-01-01T00:00:00Z",
                    }
                ]
            },
        }
        result = client.build.triggers.list(project_id="proj_1")

    assert result["pagination"]["total"] == 1
    assert isinstance(result["items"][0], Trigger)
    mock_get.assert_called_once_with("/workflows/projects/proj_1/entities")
    client.close()


def test_triggers_get_returns_model():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "connection_id": "conn_42",
                "project_id": "proj_1",
                "key": "source",
                "name": "Orders API",
                "type": "api",
                "status": "active",
                "created_at": "2024-03-01T00:00:00Z",
                "updated_at": "2024-03-01T00:00:00Z",
            },
        }
        result = client.build.triggers.get("conn_42", project_id="proj_1")

    assert isinstance(result, Trigger)
    assert result.connection_id == "conn_42"
    mock_get.assert_called_once_with("/workflows/projects/proj_1/entities/connections/conn_42")
    client.close()


def test_triggers_create_requires_workflow_id():
    client = LoxtepClient(api_url="https://api.example.com")
    with pytest.raises(ValueError, match="requires workflow_id"):
        client.build.triggers.create(
            project_id="proj_1", workflow_id="", key="k", name="n", type="api"
        )
    client.close()


def test_triggers_create_puts_connection_body():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "put") as mock_put:
        mock_put.return_value = {
            "success": True,
            "data": {
                "connection_id": "conn_new",
                "project_id": "proj_1",
                "workflow_id": "wf_1",
                "key": "source",
                "name": "Orders API",
                "type": "api",
                "status": "active",
                "created_at": "2024-06-01T00:00:00Z",
                "updated_at": "2024-06-01T00:00:00Z",
            },
        }
        result = client.build.triggers.create(
            project_id="proj_1", workflow_id="wf_1", key="source", name="Orders API", type="api"
        )

    assert isinstance(result, Trigger)
    assert result.connection_id == "conn_new"
    call_url, call_body = mock_put.call_args[0]
    assert call_url.startswith("/workflows/projects/proj_1/entities/connections/")
    assert "workflow_id=wf_1" in call_url
    assert call_body["workflow_id"] == "wf_1"
    client.close()


def test_triggers_delete_calls_http_delete():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "delete") as mock_delete:
        mock_delete.return_value = None
        result = client.build.triggers.delete("conn_1", project_id="proj_1")

    assert result is None
    mock_delete.assert_called_once_with("/workflows/projects/proj_1/entities/connections/conn_1")
    client.close()
