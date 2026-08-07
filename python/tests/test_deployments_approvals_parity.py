"""Tests for deployments / approvals / capture_samples / status (Node 0.9.x parity)."""

from unittest.mock import MagicMock, patch

import pytest

from loxtep import LoxtepClient
from loxtep.approvals import ApprovalsApi
from loxtep.deployments import DeploymentsApi, pick_latest_deployment
from loxtep.project_workspace_status import (
    build_project_workspace_status,
    derive_next_action,
    github_state_from_project,
)


def _deployment(**overrides):
    base = {
        "deployment_id": "dep-1",
        "project_id": "proj-1",
        "instance_id": "inst-1",
        "name": "SDK App Events Ingest",
        "type": "workflow",
        "status": "pending",
        "created_at": "2026-08-06T21:30:00Z",
        "updated_at": "2026-08-06T21:30:00Z",
    }
    base.update(overrides)
    return base


def test_deployments_list_calls_get_with_filters():
    http = MagicMock()
    http.get.return_value = {
        "success": True,
        "data": {"items": [_deployment()], "pagination": {"page": 1}},
    }
    api = DeploymentsApi(http)
    result = api.list(project_id="proj-1", workflow_id="wf-1", status="pending", page=2)
    path = http.get.call_args[0][0]
    assert path.startswith("/workflows/deployments?")
    assert "project_id=proj-1" in path
    assert "workflow_id=wf-1" in path
    assert "status=pending" in path
    assert "page=2" in path
    assert result["items"][0]["deployment_id"] == "dep-1"


def test_deployments_get_include_versions():
    http = MagicMock()
    http.get.return_value = {"success": True, "data": _deployment()}
    api = DeploymentsApi(http)
    result = api.get("dep-1", include_versions=True)
    assert http.get.call_args[0][0] == "/workflows/deployments/dep-1?include_versions=true"
    assert result["deployment_id"] == "dep-1"


def test_pick_latest_deployment_prefers_deployed():
    items = [
        _deployment(deployment_id="old", status="pending", updated_at="2026-08-07T00:00:00Z"),
        _deployment(deployment_id="ok", status="deployed", updated_at="2026-08-06T00:00:00Z"),
    ]
    assert pick_latest_deployment(items)["deployment_id"] == "ok"


def test_client_wires_workspace_and_observe_deployments():
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org-1")
    with patch.object(client._http, "get") as mock_get:
        mock_get.return_value = {"success": True, "data": {"items": [], "pagination": {}}}
        client.workspace.deployments.list(project_id="p1")
        client.observe.list_deployments(project_id="p1")
    assert mock_get.call_count == 2
    assert all("/workflows/deployments" in c[0][0] for c in mock_get.call_args_list)
    client.close()


def test_approvals_list_pending_and_approve():
    http = MagicMock()
    http.get.return_value = {"success": True, "data": {"items": [{"approval_request_id": "a1"}]}}
    http.post.return_value = {
        "success": True,
        "data": {"approval_request_id": "a1", "status": "approved"},
    }
    api = ApprovalsApi(http, organization_id="org-1")
    listed = api.list_pending()
    assert listed["items"][0]["approval_request_id"] == "a1"
    assert "approval-requests?status=pending" in http.get.call_args[0][0]
    decided = api.approve("a1")
    assert decided["status"] == "approved"
    assert http.post.call_args[0][0].endswith("/approval-requests/a1/approve")


def test_approvals_requires_organization_id():
    api = ApprovalsApi(MagicMock())
    with pytest.raises(ValueError, match="organization_id"):
        api.list_pending()


def test_client_review_approvals_not_stub():
    client = LoxtepClient(api_url="https://api.example.com", organization_id="org-1")
    assert client.review.approvals.unavailable is False
    assert hasattr(client.review.approvals, "list_pending")
    assert hasattr(client.review.approvals, "approve")
    client.close()


def test_connectors_capture_samples():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {"success": True, "data": {"samples": [{"id": 1}]}}
        result = client.connect.connectors.capture_samples(
            "conn-1", entity_type="orders", limit=5
        )
    assert result["samples"][0]["id"] == 1
    assert mock_post.call_args[0][0] == "/connectors/connectors/conn-1/capture-samples"
    assert mock_post.call_args[0][1] == {"entity_type": "orders", "limit": 5}
    client.close()


def test_build_project_workspace_status_deployed():
    status = build_project_workspace_status(
        {
            "population_depth": "status",
            "local": {
                "project_id": "proj-1",
                "path": "/tmp/p",
                "instance_id": "inst-1",
                "api_url": "https://api.example.com",
            },
            "cloud": {
                "project_id": "proj-1",
                "name": "Demo",
                "github_repo_url": "https://github.com/acme/demo",
            },
            "deployments": [
                _deployment(status="deployed", updated_at="2026-08-06T12:00:00Z"),
            ],
            "local_git_dirty": False,
            "now_ms": 1_725_000_000_000,
        }
    )
    assert status["schema_version"] == 1
    assert status["deployed"]["state"] == "deployed"
    assert status["next_action"] == "none"
    assert status["local"]["attach_state"] == "attached"
    assert status["cloud"]["github"]["state"] == "linked"


def test_derive_next_action_and_github_helpers():
    assert github_state_from_project({"github_repo_name": "x"}) == "linked"
    assert github_state_from_project({}) == "unbound"
    assert (
        derive_next_action(
            local_present=True,
            attach_state="attached",
            github_state="linked",
            deployed_state="never_deployed",
            local_to_cloud_dirty=False,
            cloud_to_deployed_dirty=True,
        )
        == "deploy"
    )
