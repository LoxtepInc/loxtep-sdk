"""
Tests for project_context.py — port of the parts of nodejs/src/cli/project-context.ts
that `generate` needs: finding/validating `.loxtep/project.json` and enforcing the
project is attached before codegen runs against it.
"""

import json
import re

import pytest

from loxtep.project_context import (
    NO_PROJECT_MESSAGE,
    NOT_ATTACHED_MESSAGE,
    ProjectPreconditionError,
    find_project_dir,
    require_attached_project,
    require_project,
)


def _write_project_json(root, data):
    loxtep_dir = root / ".loxtep"
    loxtep_dir.mkdir(parents=True, exist_ok=True)
    (loxtep_dir / "project.json").write_text(json.dumps(data), encoding="utf-8")


def test_find_project_dir_walks_up_from_subdirectory(tmp_path):
    _write_project_json(tmp_path, {"project_id": "proj-1"})
    subdir = tmp_path / "a" / "b"
    subdir.mkdir(parents=True)
    assert find_project_dir(str(subdir)) == str(tmp_path)


def test_find_project_dir_returns_none_when_absent(tmp_path):
    assert find_project_dir(str(tmp_path)) is None


def test_require_project_raises_when_missing(tmp_path):
    with pytest.raises(ProjectPreconditionError, match=re.escape(NO_PROJECT_MESSAGE)):
        require_project(str(tmp_path))


def test_require_project_raises_on_invalid_json(tmp_path):
    loxtep_dir = tmp_path / ".loxtep"
    loxtep_dir.mkdir()
    (loxtep_dir / "project.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(ProjectPreconditionError, match="not valid JSON"):
        require_project(str(tmp_path))


def test_require_project_raises_on_local_only_project_id(tmp_path):
    _write_project_json(tmp_path, {"project_id": "proj_local_abc123"})
    with pytest.raises(ProjectPreconditionError, match="not registered on the platform"):
        require_project(str(tmp_path))


def test_require_project_succeeds_with_valid_config(tmp_path):
    _write_project_json(tmp_path, {"project_id": "proj-1", "organization_id": "org-1"})
    project_dir, project = require_project(str(tmp_path))
    assert project_dir == str(tmp_path)
    assert project["project_id"] == "proj-1"


def test_require_attached_project_raises_when_not_attached(tmp_path):
    _write_project_json(tmp_path, {"project_id": "proj-1"})
    with pytest.raises(ProjectPreconditionError, match=re.escape(NOT_ATTACHED_MESSAGE)):
        require_attached_project(str(tmp_path))


def test_require_attached_project_succeeds_when_attached(tmp_path):
    _write_project_json(
        tmp_path,
        {"project_id": "proj-1", "instance_id": "inst-1", "api_url": "https://apidev.loxtep.io"},
    )
    project_dir, project = require_attached_project(str(tmp_path))
    assert project["instance_id"] == "inst-1"
    assert project["api_url"] == "https://apidev.loxtep.io"
