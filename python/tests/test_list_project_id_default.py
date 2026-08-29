"""workflows.list() / triggers.list() default to client.project_id."""

from unittest.mock import patch

from loxtep import LoxtepClient


def test_workflows_list_defaults_to_client_project_id():
    client = LoxtepClient(api_url="https://api.example.com", project_id="client-proj")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "items": [],
                "pagination": {"page": 1, "page_size": 100, "total": 0, "total_pages": 0},
            },
        }
        client.build.workflows.list()
    mock_get.assert_called_once()
    path = mock_get.call_args[0][0]
    assert "project_id=client-proj" in path
    client.close()


def test_workflows_list_explicit_project_id_wins():
    client = LoxtepClient(api_url="https://api.example.com", project_id="client-proj")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {
                "items": [],
                "pagination": {"page": 1, "page_size": 100, "total": 0, "total_pages": 0},
            },
        }
        client.build.workflows.list("explicit-proj")
    path = mock_get.call_args[0][0]
    assert "project_id=explicit-proj" in path
    assert "project_id=client-proj" not in path
    client.close()


def test_triggers_list_defaults_to_client_project_id():
    client = LoxtepClient(api_url="https://api.example.com", project_id="client-proj")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"connections": []}}
        client.build.triggers.list()
    mock_get.assert_called_once_with("/workflows/projects/client-proj/entities")
    client.close()


def test_triggers_list_explicit_project_id_wins():
    client = LoxtepClient(api_url="https://api.example.com", project_id="client-proj")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"connections": []}}
        client.build.triggers.list(project_id="explicit-proj")
    mock_get.assert_called_once_with("/workflows/projects/explicit-proj/entities")
    client.close()
