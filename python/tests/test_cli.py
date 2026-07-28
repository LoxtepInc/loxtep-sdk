"""Basic tests for CLI and CLI config."""

import json
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from loxtep.cli import _is_native_command, main
from loxtep.cli_config import load_config, load_credentials, get_token_from_env_or_file


def test_cli_help_returns_zero(monkeypatch):
    monkeypatch.setattr("sys.argv", ["loxtep", "--help"])
    with pytest.raises(SystemExit) as exc_info:
        main()
    assert exc_info.value.code == 0


def test_is_native_command_recognizes_implemented_surfaces():
    assert _is_native_command([]) is True
    assert _is_native_command(["--help"]) is True
    assert _is_native_command(["query", "dp_1", "SELECT 1"]) is True
    assert _is_native_command(["workflows", "list"]) is True
    assert _is_native_command(["workflows", "deploy"]) is True
    assert _is_native_command(["projects", "list"]) is True


def test_is_native_command_rejects_unimplemented_surfaces():
    # Fully unknown top-level command.
    assert _is_native_command(["unknown-cmd"]) is False
    # Known top-level command, but a subcommand this Python CLI doesn't implement natively
    # (e.g. `workflows create` — Node has it, Python delegates rather than reimplementing).
    assert _is_native_command(["workflows", "create"]) is False
    assert _is_native_command(["ingest", "provision"]) is False
    assert _is_native_command(["deploy"]) is False


def test_cli_unknown_command_delegates_to_node_cli_and_returns_nonzero(monkeypatch):
    """Unrecognized commands now delegate to `npx loxtep ...` (E2E CLI-parity design)
    rather than failing via argparse's own "invalid choice" SystemExit."""
    monkeypatch.setattr("sys.argv", ["loxtep", "unknown-cmd"])
    with patch("loxtep.cli.subprocess.run", side_effect=FileNotFoundError()):
        rc = main()
    assert rc != 0


def test_cli_delegates_workflows_create_to_node_cli(monkeypatch):
    monkeypatch.setattr("sys.argv", ["loxtep", "workflows", "create", "--name", "x"])
    with patch("loxtep.cli.subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(args=[], returncode=0)
        rc = main()
    assert rc == 0
    called_args = mock_run.call_args[0][0]
    assert called_args == ["npx", "loxtep", "workflows", "create", "--name", "x"]


def test_load_config_from_env(monkeypatch):
    monkeypatch.setenv("LOXTEP_API_URL", "https://api.test.com")
    monkeypatch.setenv("LOXTEP_ORGANIZATION_ID", "org-1")
    monkeypatch.setenv("LOXTEP_PROJECT_ID", "proj-1")
    config = load_config()
    assert config.get("api_url") == "https://api.test.com"
    assert config.get("organization_id") == "org-1"
    assert config.get("project_id") == "proj-1"


def test_load_credentials_missing_returns_none(monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        monkeypatch.setenv("LOXTEP_CONFIG_DIR", d)
        assert load_credentials() is None


def test_load_credentials_valid_file(monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        monkeypatch.setenv("LOXTEP_CONFIG_DIR", d)
        cred_path = Path(d) / "credentials.json"
        cred_path.write_text(json.dumps({"access_token": "jwt-here"}))
        creds = load_credentials()
        assert creds is not None
        assert creds.get("access_token") == "jwt-here"


def test_get_token_from_env_or_file(monkeypatch):
    monkeypatch.setenv("LOXTEP_TOKEN", "env-token")
    assert get_token_from_env_or_file() == "env-token"
    monkeypatch.delenv("LOXTEP_TOKEN", raising=False)
    with tempfile.TemporaryDirectory() as d:
        monkeypatch.setenv("LOXTEP_CONFIG_DIR", d)
        cred_path = Path(d) / "credentials.json"
        cred_path.write_text(json.dumps({"access_token": "file-token"}))
        assert get_token_from_env_or_file() == "file-token"
