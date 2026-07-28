"""
Tests for local-first credentials.json resolution — port of Node's
`resolveCredentialsPath` (nodejs/src/cli/credentials.ts): a project-local
`.loxtep/credentials.json` found by walking up from cwd must win over the global
`~/.loxtep/credentials.json` (or LOXTEP_CONFIG_DIR override).
"""

import json

from loxtep.cli_config import get_token_from_env_or_file, load_config, load_credentials


def _write_credentials(directory, data):
    loxtep_dir = directory / ".loxtep"
    loxtep_dir.mkdir(parents=True, exist_ok=True)
    (loxtep_dir / "credentials.json").write_text(json.dumps(data), encoding="utf-8")


def test_load_credentials_prefers_local_over_global(tmp_path, monkeypatch):
    global_dir = tmp_path / "global"
    global_dir.mkdir(parents=True)
    (global_dir / "credentials.json").write_text(json.dumps({"access_token": "global-token"}), encoding="utf-8")
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(global_dir))

    project_dir = tmp_path / "project"
    project_dir.mkdir()
    _write_credentials(project_dir, {"access_token": "local-token"})

    creds = load_credentials(str(project_dir))

    assert creds is not None
    assert creds["access_token"] == "local-token"


def test_load_credentials_falls_back_to_global_when_no_local(tmp_path, monkeypatch):
    global_dir = tmp_path / "global"
    global_dir.mkdir(parents=True)
    (global_dir / "credentials.json").write_text(json.dumps({"access_token": "global-token"}), encoding="utf-8")
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(global_dir))

    empty_dir = tmp_path / "nowhere"
    empty_dir.mkdir()

    creds = load_credentials(str(empty_dir))

    assert creds is not None
    assert creds["access_token"] == "global-token"


def test_load_credentials_finds_local_file_from_nested_subdirectory(tmp_path, monkeypatch):
    global_dir = tmp_path / "global"
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(global_dir))
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    _write_credentials(project_dir, {"access_token": "local-token"})
    nested = project_dir / "a" / "b" / "c"
    nested.mkdir(parents=True)

    creds = load_credentials(str(nested))

    assert creds is not None
    assert creds["access_token"] == "local-token"


def test_get_token_from_env_or_file_prefers_local_credentials(tmp_path, monkeypatch):
    monkeypatch.delenv("LOXTEP_TOKEN", raising=False)
    global_dir = tmp_path / "global"
    global_dir.mkdir(parents=True)
    (global_dir / "credentials.json").write_text(json.dumps({"access_token": "global-token"}), encoding="utf-8")
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(global_dir))

    project_dir = tmp_path / "project"
    project_dir.mkdir()
    _write_credentials(project_dir, {"access_token": "local-token"})

    assert get_token_from_env_or_file(str(project_dir)) == "local-token"


def test_get_token_from_env_or_file_env_wins_over_local_credentials(tmp_path, monkeypatch):
    monkeypatch.setenv("LOXTEP_TOKEN", "env-token")
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    _write_credentials(project_dir, {"access_token": "local-token"})

    assert get_token_from_env_or_file(str(project_dir)) == "env-token"


def test_load_config_api_base_url_fallback_prefers_local_credentials(tmp_path, monkeypatch):
    monkeypatch.delenv("LOXTEP_API_URL", raising=False)
    global_dir = tmp_path / "global"
    global_dir.mkdir(parents=True)
    (global_dir / "credentials.json").write_text(
        json.dumps({"access_token": "tok", "api_base_url": "https://api.loxtep.io"}), encoding="utf-8"
    )
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(global_dir))

    project_dir = tmp_path / "project"
    project_dir.mkdir()
    _write_credentials(project_dir, {"access_token": "tok", "api_base_url": "https://apidev.loxtep.io"})

    config = load_config(str(project_dir))

    assert config["api_url"] == "https://apidev.loxtep.io"
