"""
Resolve `.loxtep/project.json` from the working directory upward.

Port of nodejs/src/cli/project-context.ts (the parts `generate` needs): finding the
project file, validating it, and enforcing that a project is attached (has
`instance_id`/`api_url`) before commands like `generate`/`deploy` run against it.
Python's CLI previously never read this file at all — every native command relied
solely on `~/.loxtep/config.json` / env vars, ignoring the per-project workspace file
that `loxtep init`/`loxtep attach` (Node CLI) write.
"""

import json
import os
from pathlib import Path
from typing import Any, Optional

PROJECT_DIR_NAME = ".loxtep"
PROJECT_FILE_NAME = "project.json"
LOCAL_PROJECT_ID_PREFIX = "proj_local_"

NO_PROJECT_MESSAGE = (
    "No .loxtep/project.json found in this directory or any parent. Run `loxtep init` first."
)
NOT_ATTACHED_MESSAGE = (
    "Project is not attached to an Instance (missing instance_id/api_url). "
    "Run `loxtep attach` first."
)
LOCAL_PROJECT_MESSAGE = (
    "Project is not registered on the platform (local-only project_id). Run `loxtep login` "
    "then `loxtep init` to register a platform project, or `loxtep init --project-id <uuid>` "
    "to bind an existing one."
)


class ProjectPreconditionError(Exception):
    """Raised when `.loxtep/project.json` is missing, invalid, or not attached.

    CLI commands catch this and print `str(exc)` to stderr, exiting 1 — mirrors
    Node's `PreconditionFailure` → `preconditionToCliResult` mapping.
    """


def is_local_project_id(project_id: str) -> bool:
    return project_id.startswith(LOCAL_PROJECT_ID_PREFIX)


def get_project_file_path(project_dir: str) -> str:
    return str(Path(project_dir) / PROJECT_DIR_NAME / PROJECT_FILE_NAME)


def find_project_dir(cwd: Optional[str] = None) -> Optional[str]:
    """Walk from `cwd` upward, returning the first directory containing
    `.loxtep/project.json`, or None if none is found."""
    directory = Path(cwd or os.getcwd()).resolve()
    while True:
        if Path(get_project_file_path(str(directory))).exists():
            return str(directory)
        if directory.parent == directory:
            return None
        directory = directory.parent


def require_project(cwd: Optional[str] = None) -> tuple[str, dict[str, Any]]:
    """Resolve and validate `.loxtep/project.json` searching from `cwd` upward.

    Returns (project_dir, project_config). Raises ProjectPreconditionError with a
    guidance message on any failure (missing file, bad JSON, missing project_id,
    local-only project_id never registered on the platform).
    """
    project_dir = find_project_dir(cwd)
    if not project_dir:
        raise ProjectPreconditionError(NO_PROJECT_MESSAGE)

    project_file_path = get_project_file_path(project_dir)
    try:
        raw = Path(project_file_path).read_text(encoding="utf-8")
    except OSError:
        raise ProjectPreconditionError(
            f"Found {project_file_path} but it could not be read. Run `loxtep init` first."
        ) from None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise ProjectPreconditionError(
            f"{project_file_path} is not valid JSON. Run `loxtep init` to recreate it."
        ) from None

    project_id = parsed.get("project_id") if isinstance(parsed, dict) else None
    if not isinstance(project_id, str) or not project_id:
        raise ProjectPreconditionError(
            f"{project_file_path} is not a valid project config: project_id is required. "
            "Run `loxtep init` to recreate it."
        )
    if is_local_project_id(project_id):
        raise ProjectPreconditionError(LOCAL_PROJECT_MESSAGE)

    return project_dir, parsed


def require_attached_project(cwd: Optional[str] = None) -> tuple[str, dict[str, Any]]:
    """Like `require_project`, but additionally enforces that the project has been
    attached: raises ProjectPreconditionError when `instance_id`/`api_url` are missing.
    Used by `generate` (and would be used by a native `deploy`/`test` if added)."""
    project_dir, project = require_project(cwd)
    instance_id = project.get("instance_id")
    api_url = project.get("api_url")
    if not isinstance(instance_id, str) or not instance_id or not isinstance(api_url, str) or not api_url:
        raise ProjectPreconditionError(NOT_ATTACHED_MESSAGE)
    return project_dir, project
