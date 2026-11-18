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


def test_deployments_get_defaults_to_client_project_id():
    client = LoxtepClient(api_url="https://api.example.com", project_id="client-proj")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"deployment_id": "dep-1"}}
        client.workspace.deployments.get("dep-1")
    path = mock_get.call_args[0][0]
    assert path == "/workflows/deployments/dep-1?project_id=client-proj"
    client.close()


def test_deployments_get_explicit_project_id_wins():
    client = LoxtepClient(api_url="https://api.example.com", project_id="client-proj")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"deployment_id": "dep-1"}}
        client.observe.get_deployment("dep-1", project_id="explicit-proj", include_versions=True)
    path = mock_get.call_args[0][0]
    assert "project_id=explicit-proj" in path
    assert "include_versions=true" in path
    assert "client-proj" not in path
    client.close()


def test_workflows_get_defaults_to_client_project_id():
    client = LoxtepClient(api_url="https://api.example.com", project_id="client-proj")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"workflow_id": "flow-1"}}
        client.build.workflows.get("flow-1")
    paths = [c[0][0] for c in mock_get.call_args_list]
    assert paths[0] == "/workflows/workflows/flow-1?project_id=client-proj"
    assert paths[1] == "/workflows/workflows/flow-1/nodes?project_id=client-proj"
    client.close()


def test_triggers_list_explicit_project_id_wins():
    client = LoxtepClient(api_url="https://api.example.com", project_id="client-proj")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"connections": []}}
        client.build.triggers.list(project_id="explicit-proj")
    mock_get.assert_called_once_with("/workflows/projects/explicit-proj/entities")
    client.close()
