"""Basic tests for CLI and CLI config."""

import os
import json
import tempfile
from pathlib import Path

import pytest

from loxtep.cli import main
from loxtep.cli_config import load_config, load_credentials, get_token_from_env_or_file


def test_cli_help_returns_zero(monkeypatch):
    monkeypatch.setattr("sys.argv", ["loxtep", "--help"])
    with pytest.raises(SystemExit) as exc_info:
        main()
    assert exc_info.value.code == 0


def test_cli_unknown_command_returns_nonzero(monkeypatch):
    monkeypatch.setattr("sys.argv", ["loxtep", "unknown-cmd"])
    with pytest.raises(SystemExit) as exc_info:
        main()
    assert exc_info.value.code != 0


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
