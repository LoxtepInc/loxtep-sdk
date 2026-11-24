"""github_pull fail-closed + repository_branch SoT (loxtep-sdk#123)."""

from unittest.mock import MagicMock, patch

import pytest

from loxtep.projects import ProjectsApi, _github_pull_payload


def test_github_pull_requires_instance_id():
    with pytest.raises(ValueError, match="instance_id is required"):
        _github_pull_payload(instance_id="")
    with pytest.raises(ValueError, match="instance_id is required"):
        _github_pull_payload(instance_id="   ")


def test_github_pull_posts_instance_id_and_optionals():
    http = MagicMock()
    http.get.side_effect = Exception("no stream-url")
    http.post.return_value = {"success": True, "data": {"success": True, "commit_sha": "abc"}}
    api = ProjectsApi(http)
    out = api.github_pull(
        "proj_1",
        instance_id="inst_1",
        commit_sha="deadbeef",
        branch="main",
    )
    http.post.assert_called_once_with(
        "/workflows/projects/proj_1/github/pull",
        {"instance_id": "inst_1", "commit_sha": "deadbeef", "branch": "main"},
    )
    assert out["commit_sha"] == "abc"


def test_github_pull_rejects_blank_instance_id_before_post():
    http = MagicMock()
    api = ProjectsApi(http)
    with pytest.raises(ValueError, match="instance_id is required"):
        api.github_pull("proj_1", instance_id=" ")
    http.post.assert_not_called()


def test_repository_prefers_repository_branch():
    http = MagicMock()
    http.get.return_value = {
        "success": True,
        "data": {
            "github_repo_url": "https://github.com/acme/repo",
            "github_repo_name": "acme/repo",
            "github_repo_path": "",
            "repository_branch": "release",
            "github_branch": "legacy",
            "github_last_commit_sha": "",
            "github_last_sync_at": "",
        },
    }
    api = ProjectsApi(http)
    binding = api.repository("proj_1")
    assert binding["branch"] == "release"


def test_repository_falls_back_to_github_branch():
    http = MagicMock()
    http.get.return_value = {
        "success": True,
        "data": {
            "github_repo_url": "https://github.com/acme/repo",
            "github_repo_name": "acme/repo",
            "github_branch": "develop",
        },
    }
    api = ProjectsApi(http)
    assert api.repository("proj_1")["branch"] == "develop"
