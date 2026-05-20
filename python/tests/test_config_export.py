"""Tests for config export --from-connector in the Python SDK CLI."""

import json
from unittest.mock import MagicMock, patch

import pytest

from loxtep.cli_config import (
    SdkConfig,
    format_sdk_config_as_env,
    format_sdk_config_as_json,
    format_sdk_config_as_shell,
    run_config_export_from_connector,
)


# ---------------------------------------------------------------------------
#  Formatting helper tests
# ---------------------------------------------------------------------------

FULL_CONFIG: SdkConfig = {
    "api_url": "https://api.loxtep.io",
    "organization_id": "org-123",
    "project_id": "proj-456",
    "instance_id": "inst-789",
    "region": "us-east-1",
}

MINIMAL_CONFIG: SdkConfig = {
    "api_url": "https://api.loxtep.io",
    "organization_id": "org-123",
}


class TestFormatSdkConfigAsShell:
    def test_full_config(self):
        result = format_sdk_config_as_shell(FULL_CONFIG)
        assert 'export LOXTEP_API_URL="https://api.loxtep.io"' in result
        assert 'export LOXTEP_ORGANIZATION_ID="org-123"' in result
        assert 'export LOXTEP_PROJECT_ID="proj-456"' in result
        assert 'export LOXTEP_INSTANCE_ID="inst-789"' in result
        assert 'export LOXTEP_REGION="us-east-1"' in result

    def test_minimal_config_omits_optional_fields(self):
        result = format_sdk_config_as_shell(MINIMAL_CONFIG)
        assert 'export LOXTEP_API_URL="https://api.loxtep.io"' in result
        assert 'export LOXTEP_ORGANIZATION_ID="org-123"' in result
        assert "LOXTEP_PROJECT_ID" not in result
        assert "LOXTEP_INSTANCE_ID" not in result
        assert "LOXTEP_REGION" not in result


class TestFormatSdkConfigAsJson:
    def test_full_config_round_trip(self):
        result = format_sdk_config_as_json(FULL_CONFIG)
        parsed = json.loads(result)
        assert parsed["api_url"] == "https://api.loxtep.io"
        assert parsed["organization_id"] == "org-123"
        assert parsed["project_id"] == "proj-456"
        assert parsed["instance_id"] == "inst-789"
        assert parsed["region"] == "us-east-1"

    def test_minimal_config_omits_optional_fields(self):
        result = format_sdk_config_as_json(MINIMAL_CONFIG)
        parsed = json.loads(result)
        assert parsed["api_url"] == "https://api.loxtep.io"
        assert parsed["organization_id"] == "org-123"
        assert "project_id" not in parsed
        assert "instance_id" not in parsed
        assert "region" not in parsed


class TestFormatSdkConfigAsEnv:
    def test_full_config(self):
        result = format_sdk_config_as_env(FULL_CONFIG)
        lines = result.split("\n")
        assert "LOXTEP_API_URL=https://api.loxtep.io" in lines
        assert "LOXTEP_ORGANIZATION_ID=org-123" in lines
        assert "LOXTEP_PROJECT_ID=proj-456" in lines
        assert "LOXTEP_INSTANCE_ID=inst-789" in lines
        assert "LOXTEP_REGION=us-east-1" in lines
        # No 'export' prefix
        for line in lines:
            assert not line.startswith("export ")

    def test_minimal_config_omits_optional_fields(self):
        result = format_sdk_config_as_env(MINIMAL_CONFIG)
        assert "LOXTEP_API_URL=https://api.loxtep.io" in result
        assert "LOXTEP_ORGANIZATION_ID=org-123" in result
        assert "LOXTEP_PROJECT_ID" not in result
        assert "LOXTEP_INSTANCE_ID" not in result
        assert "LOXTEP_REGION" not in result


# ---------------------------------------------------------------------------
#  run_config_export_from_connector tests
# ---------------------------------------------------------------------------

SDK_CONNECTOR_RESPONSE = {
    "connector_id": "conn-abc",
    "connector_type": "sdk",
    "metadata": {
        "name": "My SDK Connector",
        "sdk_config": {
            "api_url": "https://api.loxtep.io",
            "organization_id": "org-123",
            "project_id": "proj-456",
            "instance_id": "inst-789",
            "region": "us-east-1",
        },
    },
}


def _mock_client_for_connector(connector_response):
    """Create a mock LoxtepClient that returns the given connector on connectors.get()."""
    mock_client = MagicMock()
    mock_client.connectors.get.return_value = connector_response
    return mock_client


class TestRunConfigExportFromConnector:
    """Tests for run_config_export_from_connector.

    The function does a lazy ``from .client import LoxtepClient`` inside its body,
    so we patch ``loxtep.client.LoxtepClient`` (the canonical location).
    """

    def test_sh_format_output(self, monkeypatch, capsys):
        monkeypatch.setenv("LOXTEP_API_URL", "https://api.loxtep.io")
        monkeypatch.setenv("LOXTEP_TOKEN", "test-token")

        mock_client = _mock_client_for_connector(SDK_CONNECTOR_RESPONSE)
        with patch("loxtep.client.LoxtepClient", return_value=mock_client):
            rc = run_config_export_from_connector("conn-abc", fmt="sh")

        assert rc == 0
        out = capsys.readouterr().out
        assert 'export LOXTEP_API_URL="https://api.loxtep.io"' in out
        assert 'export LOXTEP_ORGANIZATION_ID="org-123"' in out

    def test_json_format_output(self, monkeypatch, capsys):
        monkeypatch.setenv("LOXTEP_API_URL", "https://api.loxtep.io")
        monkeypatch.setenv("LOXTEP_TOKEN", "test-token")

        mock_client = _mock_client_for_connector(SDK_CONNECTOR_RESPONSE)
        with patch("loxtep.client.LoxtepClient", return_value=mock_client):
            rc = run_config_export_from_connector("conn-abc", fmt="json")

        assert rc == 0
        parsed = json.loads(capsys.readouterr().out)
        assert parsed["api_url"] == "https://api.loxtep.io"
        assert parsed["organization_id"] == "org-123"

    def test_env_format_output(self, monkeypatch, capsys):
        monkeypatch.setenv("LOXTEP_API_URL", "https://api.loxtep.io")
        monkeypatch.setenv("LOXTEP_TOKEN", "test-token")

        mock_client = _mock_client_for_connector(SDK_CONNECTOR_RESPONSE)
        with patch("loxtep.client.LoxtepClient", return_value=mock_client):
            rc = run_config_export_from_connector("conn-abc", fmt="env")

        assert rc == 0
        out = capsys.readouterr().out
        assert "LOXTEP_API_URL=https://api.loxtep.io" in out
        assert "LOXTEP_ORGANIZATION_ID=org-123" in out
        assert "export" not in out

    def test_error_connector_not_found(self, monkeypatch, capsys):
        monkeypatch.setenv("LOXTEP_API_URL", "https://api.loxtep.io")
        monkeypatch.setenv("LOXTEP_TOKEN", "test-token")

        mock_client = MagicMock()
        mock_client.connectors.get.side_effect = Exception("404 Not Found")
        with patch("loxtep.client.LoxtepClient", return_value=mock_client):
            rc = run_config_export_from_connector("conn-missing")

        assert rc == 1
        err = capsys.readouterr().err
        assert "not found" in err.lower()

    def test_error_connector_not_sdk_type(self, monkeypatch, capsys):
        monkeypatch.setenv("LOXTEP_API_URL", "https://api.loxtep.io")
        monkeypatch.setenv("LOXTEP_TOKEN", "test-token")

        non_sdk_connector = {
            "connector_id": "conn-xyz",
            "connector_type": "oauth",
            "metadata": {},
        }
        mock_client = _mock_client_for_connector(non_sdk_connector)
        with patch("loxtep.client.LoxtepClient", return_value=mock_client):
            rc = run_config_export_from_connector("conn-xyz")

        assert rc == 1
        err = capsys.readouterr().err
        assert "oauth" in err.lower()
        assert "not 'sdk'" in err

    def test_error_missing_sdk_config(self, monkeypatch, capsys):
        monkeypatch.setenv("LOXTEP_API_URL", "https://api.loxtep.io")
        monkeypatch.setenv("LOXTEP_TOKEN", "test-token")

        bad_connector = {
            "connector_id": "conn-bad",
            "connector_type": "sdk",
            "metadata": {"name": "Bad connector"},
        }
        mock_client = _mock_client_for_connector(bad_connector)
        with patch("loxtep.client.LoxtepClient", return_value=mock_client):
            rc = run_config_export_from_connector("conn-bad")

        assert rc == 1
        err = capsys.readouterr().err
        assert "missing sdk_config" in err.lower()

    def test_error_missing_api_url(self, monkeypatch, capsys):
        monkeypatch.delenv("LOXTEP_API_URL", raising=False)
        monkeypatch.setenv("LOXTEP_TOKEN", "test-token")
        # Ensure no config file is loaded
        monkeypatch.setenv("LOXTEP_CONFIG_DIR", "/nonexistent")

        rc = run_config_export_from_connector("conn-abc")

        assert rc == 1
        err = capsys.readouterr().err
        assert "missing api_url" in err.lower()

    def test_error_not_logged_in(self, monkeypatch, capsys):
        monkeypatch.setenv("LOXTEP_API_URL", "https://api.loxtep.io")
        monkeypatch.delenv("LOXTEP_TOKEN", raising=False)
        monkeypatch.setenv("LOXTEP_CONFIG_DIR", "/nonexistent")

        rc = run_config_export_from_connector("conn-abc")

        assert rc == 1
        err = capsys.readouterr().err
        assert "not logged in" in err.lower()
