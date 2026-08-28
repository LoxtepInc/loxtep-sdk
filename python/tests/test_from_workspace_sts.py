"""from_workspace loads STS aws_credentials and global config instance_id/api_url."""

from unittest.mock import MagicMock

from loxtep.client import LoxtepClient
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


def test_from_workspace_loads_aws_credentials_and_signs(tmp_path, monkeypatch):
    _clear_loxtep_env(monkeypatch)
    project = tmp_path / "app"
    loxtep = install_workspace(project, project="project-minimal.json", credentials=None)
    (loxtep / "credentials.json").write_text(
        """{
  "access_token": "tok-local",
  "aws_credentials": {
    "access_key_id": "ASIAEXAMPLEKEY",
    "secret_access_key": "test-secret",
    "session_token": "test-session-token"
  }
}
""",
        encoding="utf-8",
    )

    client = LoxtepClient.from_workspace(cwd=str(project))
    try:
        assert client._http._credentials is not None
        assert client._http._credentials["access_key_id"] == "ASIAEXAMPLEKEY"
        assert "session_token" in client._http._credentials

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"success": true}'
        mock_resp.headers = {}
        mock_resp.json.return_value = {"success": True}

        def _request(method, url, headers=None, content=None, **_kwargs):
            assert headers["authorization"].startswith("AWS4-HMAC-SHA256 ")
            assert headers["x-amz-security-token"] == "test-session-token"
            assert headers["x-jwt-token"] == "tok-local"
            return mock_resp

        monkeypatch.setattr(client._http._client, "request", _request)
        client._http.get("/organizations/users/me")
    finally:
        client.close()


def test_from_workspace_reads_global_config_instance_and_api_url(tmp_path, monkeypatch):
    _clear_loxtep_env(monkeypatch)
    project = tmp_path / "app"
    install_workspace(project, project="project-no-api-url.json")
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    (global_dir / "config.json").write_text(
        '{"api_url": "https://from-global.loxtep.io", "instance_id": "inst-global"}',
        encoding="utf-8",
    )
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(global_dir))

    client = LoxtepClient.from_workspace(cwd=str(project))
    try:
        assert client.api_url == "https://from-global.loxtep.io"
        assert client.instance_id == "inst-global"
        assert client.project_id == "proj-1"
    finally:
        client.close()
