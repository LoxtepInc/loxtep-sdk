"""
Tests for reading `api_base_url` from credentials.json as an api_url fallback.

Parity with Node's fix for headless `login --console` not persisting `api_base_url`:
once persisted, Python must honor it the same way `resolveCliApiUrl` does on the Node
side, so a dev/staging login isn't silently overridden by the baked-in production default.
"""

import json

from loxtep.cli_config import load_config, load_credentials


def _write_credentials(config_dir, data):
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "credentials.json").write_text(json.dumps(data), encoding="utf-8")


def test_load_credentials_surfaces_api_base_url(tmp_path, monkeypatch):
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(tmp_path))
    _write_credentials(tmp_path, {"access_token": "tok", "api_base_url": "https://apidev.loxtep.io/"})

    creds = load_credentials()
    assert creds is not None
    assert creds["api_base_url"] == "https://apidev.loxtep.io"


def test_load_credentials_omits_api_base_url_when_absent(tmp_path, monkeypatch):
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(tmp_path))
    _write_credentials(tmp_path, {"access_token": "tok"})

    creds = load_credentials()
    assert creds is not None
    assert "api_base_url" not in creds


def test_load_config_falls_back_to_credentials_api_base_url(tmp_path, monkeypatch):
    monkeypatch.delenv("LOXTEP_API_URL", raising=False)
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(tmp_path))
    _write_credentials(tmp_path, {"access_token": "tok", "api_base_url": "https://apidev.loxtep.io"})

    config = load_config()
    assert config["api_url"] == "https://apidev.loxtep.io"


def test_load_config_env_wins_over_credentials_api_base_url(tmp_path, monkeypatch):
    monkeypatch.setenv("LOXTEP_API_URL", "https://api.loxtep.io")
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(tmp_path))
    _write_credentials(tmp_path, {"access_token": "tok", "api_base_url": "https://apidev.loxtep.io"})

    config = load_config()
    assert config["api_url"] == "https://api.loxtep.io"
