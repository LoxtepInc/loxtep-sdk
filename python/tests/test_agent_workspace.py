"""Tests for agent workspace read path (LOX-1250)."""

from unittest.mock import MagicMock

import pytest

from loxtep.agent_workspace import GoalsApi, IssuesApi, WorkstreamsApi


def test_issues_list_and_get():
    http = MagicMock()
    http.get.return_value = {
        "success": True,
        "data": {"items": [{"issue_id": "iss-1", "title": "Ship it"}], "total": 1},
    }
    api = IssuesApi(http, organization_id="org-1")
    result = api.list_issues(status="open", goal_id="g1", page=2)
    path = http.get.call_args[0][0]
    assert path.startswith("/agent-orchestration/organizations/org-1/issues?")
    assert "status=open" in path
    assert "goal_id=g1" in path
    assert "page=2" in path
    assert result["items"][0]["issue_id"] == "iss-1"

    http.get.return_value = {"success": True, "data": {"issue_id": "iss-1"}}
    got = api.get_issue("iss-1")
    assert http.get.call_args[0][0] == "/agent-orchestration/issues/iss-1"
    assert got["issue_id"] == "iss-1"


def test_goals_and_workstreams_list_get():
    http = MagicMock()
    http.get.return_value = {"success": True, "data": {"goals": [{"goal_id": "g1"}]}}
    goals = GoalsApi(http, organization_id="org-1")
    listed = goals.list(page=1)
    assert "/agent-orchestration/organizations/org-1/goals" in http.get.call_args[0][0]
    assert listed["items"][0]["goal_id"] == "g1"

    http.get.return_value = {"success": True, "data": {"goal_id": "g1"}}
    assert goals.get("g1")["goal_id"] == "g1"
    assert http.get.call_args[0][0] == "/agent-orchestration/goals/g1"

    http.get.return_value = {
        "success": True,
        "data": {"items": [{"workstream_id": "ws-1"}]},
    }
    ws = WorkstreamsApi(http, organization_id="org-1")
    ws_listed = ws.list_workstreams()
    assert (
        http.get.call_args[0][0]
        == "/agent-orchestration/organizations/org-1/workstreams"
    )
    assert ws_listed["items"][0]["workstream_id"] == "ws-1"

    http.get.return_value = {"success": True, "data": {"workstream_id": "ws-1"}}
    assert ws.get_workstream("ws-1")["workstream_id"] == "ws-1"
    assert http.get.call_args[0][0] == "/agent-orchestration/workstreams/ws-1"


def test_list_requires_organization_id():
    http = MagicMock()
    with pytest.raises(ValueError, match="organization_id"):
        IssuesApi(http).list()
