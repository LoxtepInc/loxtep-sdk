"""Unit tests for ``loxtep.workspace_config`` (shared fixtures)."""

from pathlib import Path

import pytest

from loxtep.errors import ValidationError
from loxtep.workspace_config import (
    load_workspace_config,
    parse_streams_partial,
    require_auto_config,
    resolve_auto_config,
    streams_with_region,
)
from workspace_fixtures import install_workspace, load_fixture


def test_parse_streams_partial_pascal_and_snake():
    snake = load_fixture("streams-snake.json")
    assert parse_streams_partial(snake) == {
        "LeoKinesisStream": "k",
        "Region": "us-east-1",
    }
    assert parse_streams_partial(None) is None
    assert parse_streams_partial({}) is None


def test_streams_with_region_injects_region():
    assert streams_with_region({"LeoKinesisStream": "k"}, "us-west-2") == {
        "LeoKinesisStream": "k",
        "Region": "us-west-2",
    }
    assert streams_with_region({"Region": "us-east-1"}, "us-west-2")["Region"] == "us-east-1"


def test_load_workspace_config_reads_project_and_credentials(tmp_path, monkeypatch):
    project = tmp_path / "app"
    install_workspace(project)

    result = load_workspace_config(str(project))
    assert result.fields["project_id"] == "proj-1"
    assert result.fields["instance_id"] == "inst-1"
    assert result.fields["token"] == "tok-local"
    assert result.fields["streams"]["LeoKinesisStream"] == "dev-LeoKinesisStream"
    assert any(p.endswith("project.json") for p in result.resolved_files)
    assert any(p.endswith("credentials.json") for p in result.resolved_files)


def test_resolve_auto_config_env_overrides_workspace(tmp_path, monkeypatch):
    monkeypatch.delenv("LOXTEP_API_URL", raising=False)
    monkeypatch.delenv("LOXTEP_TOKEN", raising=False)
    monkeypatch.delenv("LOXTEP_PROJECT_ID", raising=False)

    project = tmp_path / "app"
    install_workspace(project, project="project-minimal.json")

    monkeypatch.setenv("LOXTEP_PROJECT_ID", "proj-env")
    resolved = resolve_auto_config(cwd=str(project))
    assert resolved.project_id == "proj-env"
    assert resolved.api_url == "https://api.example"
    assert resolved.token == "tok-local"


def test_require_auto_config_names_missing_credentials(tmp_path, monkeypatch):
    monkeypatch.delenv("LOXTEP_TOKEN", raising=False)

    project = tmp_path / "app"
    install_workspace(project, project="project-minimal.json", credentials=None)

    with pytest.raises(ValidationError, match="credentials.json"):
        require_auto_config(resolve_auto_config(cwd=str(project)))


def test_require_auto_config_names_missing_project(tmp_path, monkeypatch):
    for key in ("LOXTEP_API_URL", "LOXTEP_TOKEN"):
        monkeypatch.delenv(key, raising=False)

    with pytest.raises(ValidationError, match="project.json"):
        require_auto_config(resolve_auto_config(cwd=str(tmp_path / "nowhere")))


def test_require_auto_config_empty_credentials(tmp_path, monkeypatch):
    monkeypatch.delenv("LOXTEP_TOKEN", raising=False)

    project = tmp_path / "app"
    install_workspace(
        project,
        project="project-minimal.json",
        credentials="credentials-empty.json",
    )

    with pytest.raises(ValidationError, match="auth token"):
        require_auto_config(resolve_auto_config(cwd=str(project)))


def test_require_auto_config_project_without_api_url(tmp_path, monkeypatch):
    for key in ("LOXTEP_API_URL", "LOXTEP_TOKEN"):
        monkeypatch.delenv(key, raising=False)

    project = tmp_path / "app"
    install_workspace(project, project="project-no-api-url.json")

    with pytest.raises(ValidationError, match="api_url"):
        require_auto_config(resolve_auto_config(cwd=str(project)))


def test_fixtures_dir_exists():
    assert (Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "workspace").is_dir()
