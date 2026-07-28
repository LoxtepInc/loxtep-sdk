"""Tests for ``LoxtepClient.from_workspace`` (uses shared workspace fixtures)."""

import pytest

from loxtep.client import AsyncLoxtepClient, LoxtepClient
from loxtep.errors import ValidationError
from workspace_fixtures import install_workspace


def _clear_loxtep_env(monkeypatch) -> None:
    for key in (
        "LOXTEP_API_URL",
        "LOXTEP_TOKEN",
        "LOXTEP_PROJECT_ID",
        "LOXTEP_INSTANCE_ID",
        "LOXTEP_ORGANIZATION_ID",
        "LOXTEP_REGION",
    ):
        monkeypatch.delenv(key, raising=False)


def test_from_workspace_builds_client(tmp_path, monkeypatch):
    _clear_loxtep_env(monkeypatch)

    project = tmp_path / "app"
    install_workspace(project)

    client = LoxtepClient.from_workspace(cwd=str(project))
    try:
        assert client.api_url == "https://apidev.loxtep.io"
        assert client.project_id == "proj-1"
        assert client.instance_id == "inst-1"
        assert client.organization_id == "org-1"
        assert client.region == "us-east-1"
        assert client._stream_config is not None
        assert client._stream_config.kinesis_stream == "dev-LeoKinesisStream"
        assert client._stream_config.region == "us-east-1"
    finally:
        client.close()


def test_async_from_workspace_builds_client(tmp_path, monkeypatch):
    _clear_loxtep_env(monkeypatch)

    project = tmp_path / "app"
    install_workspace(project, project="project-minimal.json")

    client = AsyncLoxtepClient.from_workspace(cwd=str(project))
    assert isinstance(client, AsyncLoxtepClient)
    assert client.project_id == "proj-1"


def test_from_workspace_missing_credentials_file_raises(tmp_path, monkeypatch):
    monkeypatch.delenv("LOXTEP_TOKEN", raising=False)

    project = tmp_path / "app"
    install_workspace(project, project="project-minimal.json", credentials=None)

    with pytest.raises(ValidationError, match="credentials.json"):
        LoxtepClient.from_workspace(cwd=str(project))
