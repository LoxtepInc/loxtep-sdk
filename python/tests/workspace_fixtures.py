"""Helpers to load shared workspace fixtures from ``shared/fixtures/workspace``."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

# python/tests → repo root is parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_FIXTURES = _REPO_ROOT / "shared" / "fixtures" / "workspace"


def load_fixture(name: str) -> dict:
    """Load a fixture JSON object by filename (e.g. ``project.json``)."""
    path = WORKSPACE_FIXTURES / name
    return json.loads(path.read_text(encoding="utf-8"))


def install_workspace(
    project_dir: Path,
    *,
    project: str = "project.json",
    credentials: str | None = "credentials.json",
) -> Path:
    """Copy shared fixtures into ``project_dir/.loxtep/`` and return that dir."""
    loxtep = project_dir / ".loxtep"
    loxtep.mkdir(parents=True, exist_ok=True)
    shutil.copy(WORKSPACE_FIXTURES / project, loxtep / "project.json")
    if credentials is not None:
        shutil.copy(WORKSPACE_FIXTURES / credentials, loxtep / "credentials.json")
    return loxtep
