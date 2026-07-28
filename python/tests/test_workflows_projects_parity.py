"""
Tests for workflows.create()'s required workflow_type/domain_id and projects.reindex(),
both ported from Node.js fixes (nodejs/src/client/flow-types.ts FlowCreateInput;
nodejs/src/client/projects.ts reindex). See E2E_TEST_REPORT.md findings #10, #12.
"""

from unittest.mock import patch

import pytest

from loxtep import LoxtepClient


def test_workflows_create_requires_workflow_type_and_domain_id():
    client = LoxtepClient(api_url="https://api.example.com")
    with pytest.raises(TypeError):
        # workflow_type/domain_id are keyword-only with no default — omitting them is a TypeError
        client.build.workflows.create("wf-name", "proj_1")
    client.close()


def test_workflows_create_sends_workflow_type_and_domain_id():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {"success": True, "data": {"workflow_id": "wf_1"}}
        client.build.workflows.create(
            "wf-name", "proj_1", workflow_type="ingestion", domain_id="dom_1"
        )

    call_path, call_body = mock_post.call_args[0]
    assert call_path == "/workflows/workflows"
    assert call_body["workflow_type"] == "ingestion"
    assert call_body["domain_id"] == "dom_1"
    client.close()


def test_projects_reindex_posts_to_reindex_endpoint():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "post") as mock_post:
        mock_post.return_value = {"success": True, "data": {"project_id": "proj_1", "enqueued": True}}
        result = client.workspace.projects.reindex("proj_1")

    mock_post.assert_called_once_with("/workflows/projects/proj_1/reindex", {})
    assert result["enqueued"] is True
    client.close()
