"""
Tests for `loxtep generate` (native Python command — emits typed Python constants,
unlike every other unimplemented command which delegates to the Node CLI).
"""

import json
from unittest.mock import MagicMock, patch

from loxtep.cli import _is_native_command, main


def _write_project_json(root, data):
    loxtep_dir = root / ".loxtep"
    loxtep_dir.mkdir(parents=True, exist_ok=True)
    (loxtep_dir / "project.json").write_text(json.dumps(data), encoding="utf-8")


def test_generate_is_native_not_delegated():
    assert _is_native_command(["generate"]) is True


def _mock_client_for_generate():
    mock_client = MagicMock()
    mock_client.build.data_products.list.return_value = {
        "items": [
            {"name": "Orders", "data_product_id": "dp_1", "domain_id": "dom_1", "schema": {}}
        ]
    }
    mock_client.connect.connectors.list.return_value = {"items": []}
    mock_client.define.domains.list.return_value = {
        "items": [{"name": "Sales", "domain_id": "dom_1"}]
    }
    mock_client.build.workflows.list.return_value = {"items": []}
    mock_client.observe.status.return_value = {"queues": []}
    return mock_client


def test_generate_fails_when_not_attached(tmp_path, monkeypatch, capsys):
    _write_project_json(tmp_path, {"project_id": "proj-1"})
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("sys.argv", ["loxtep", "generate"])

    rc = main()

    assert rc == 1
    assert "loxtep attach" in capsys.readouterr().err


def test_generate_fails_when_not_logged_in(tmp_path, monkeypatch, capsys):
    _write_project_json(
        tmp_path,
        {"project_id": "proj-1", "instance_id": "inst-1", "api_url": "https://apidev.loxtep.io"},
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("sys.argv", ["loxtep", "generate"])
    monkeypatch.delenv("LOXTEP_TOKEN", raising=False)
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(tmp_path / "no-creds-here"))

    rc = main()

    assert rc == 1
    assert "Not logged in" in capsys.readouterr().err


def test_generate_writes_python_artifact_and_prints_counts(tmp_path, monkeypatch, capsys):
    _write_project_json(
        tmp_path,
        {"project_id": "proj-1", "instance_id": "inst-1", "api_url": "https://apidev.loxtep.io"},
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("sys.argv", ["loxtep", "generate"])
    monkeypatch.setenv("LOXTEP_TOKEN", "test-token")

    mock_client = _mock_client_for_generate()
    with patch("loxtep.client.LoxtepClient", return_value=mock_client):
        rc = main()

    assert rc == 0
    out = capsys.readouterr().out
    assert "Data products: 1" in out
    assert "Domains:       1" in out

    artifact = tmp_path / ".loxtep" / "generated" / "__init__.py"
    assert artifact.exists()
    namespace: dict = {}
    exec(artifact.read_text(encoding="utf-8"), namespace)  # noqa: S102
    assert namespace["DATA_PRODUCTS"]["orders"]["id"] == "dp_1"
    assert namespace["DOMAINS"]["sales"]["id"] == "dom_1"
