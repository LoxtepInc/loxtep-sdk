"""
Workspace-aware config resolution for SDK auto-config.

Port of nodejs/src/config/workspace-config.ts.

Precedence: env vars > explicit options > `.loxtep/project.json` + credentials.json
(project-local first, then ``~/.loxtep/credentials.json``).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Optional

from .cli_config import _resolve_credentials_path
from .errors import ValidationError
from .project_context import PROJECT_DIR_NAME, PROJECT_FILE_NAME, find_project_dir, get_project_file_path

ENV_API_URL = "LOXTEP_API_URL"
ENV_ORGANIZATION_ID = "LOXTEP_ORGANIZATION_ID"
ENV_PROJECT_ID = "LOXTEP_PROJECT_ID"
ENV_INSTANCE_ID = "LOXTEP_INSTANCE_ID"
ENV_REGION = "LOXTEP_REGION"
ENV_TOKEN = "LOXTEP_TOKEN"

# PascalCase Leo keys written by `loxtep attach` into project.json `streams`.
_STREAM_KEYS = (
    "Region",
    "LeoEvent",
    "LeoStream",
    "LeoCron",
    "LeoS3",
    "LeoKinesisStream",
    "LeoFirehoseStream",
    "LeoSettings",
)


def _trim_str(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def parse_streams_partial(raw: Any) -> Optional[dict[str, str]]:
    """Keep known stream-bus keys from a project.json ``streams`` object."""
    if not isinstance(raw, dict):
        return None
    out: dict[str, str] = {}
    for key in _STREAM_KEYS:
        val = _trim_str(raw.get(key))
        if val is not None:
            out[key] = val
    # Also accept snake_case aliases if present
    snake_map = {
        "region": "Region",
        "kinesis_stream": "LeoKinesisStream",
        "firehose_stream": "LeoFirehoseStream",
        "s3_bucket": "LeoS3",
        "stream_table": "LeoStream",
        "event_table": "LeoEvent",
        "cron_table": "LeoCron",
        "settings_table": "LeoSettings",
    }
    for snake, pascal in snake_map.items():
        if pascal not in out:
            val = _trim_str(raw.get(snake))
            if val is not None:
                out[pascal] = val
    return out or None


@dataclass
class WorkspaceConfigResult:
    fields: dict[str, Any] = field(default_factory=dict)
    resolved_files: list[str] = field(default_factory=list)
    missing_files: list[str] = field(default_factory=list)


@dataclass
class AutoConfigResult:
    api_url: Optional[str] = None
    organization_id: Optional[str] = None
    project_id: Optional[str] = None
    instance_id: Optional[str] = None
    region: Optional[str] = None
    streams: Optional[dict[str, str]] = None
    token: Optional[str] = None
    resolved_files: list[str] = field(default_factory=list)
    missing_files: list[str] = field(default_factory=list)


def load_workspace_config(cwd: Optional[str] = None) -> WorkspaceConfigResult:
    """Load fields from ``.loxtep/project.json`` and credentials only (no env/explicit)."""
    work_dir = cwd or os.getcwd()
    resolved_files: list[str] = []
    missing_files: list[str] = []
    fields: dict[str, Any] = {}

    project_dir = find_project_dir(work_dir)
    if project_dir:
        project_file_path = get_project_file_path(project_dir)
        try:
            parsed = json.loads(Path(project_file_path).read_text(encoding="utf-8"))
            if isinstance(parsed, dict):
                for key in ("api_url", "organization_id", "project_id", "instance_id", "region"):
                    val = _trim_str(parsed.get(key))
                    if val is not None:
                        fields[key] = val
                streams = parse_streams_partial(parsed.get("streams"))
                if streams:
                    fields["streams"] = streams
            resolved_files.append(project_file_path)
        except (OSError, json.JSONDecodeError):
            missing_files.append(project_file_path)
    else:
        missing_files.append(str(Path(work_dir) / PROJECT_DIR_NAME / PROJECT_FILE_NAME))

    credentials_path = _resolve_credentials_path(work_dir)
    if credentials_path.exists():
        try:
            parsed = json.loads(credentials_path.read_text(encoding="utf-8"))
            if isinstance(parsed, dict):
                token = _trim_str(parsed.get("access_token"))
                if token is not None:
                    fields["token"] = token
                if "api_url" not in fields:
                    api_base = _trim_str(parsed.get("api_base_url"))
                    if api_base is not None:
                        fields["api_url"] = api_base.rstrip("/")
            resolved_files.append(str(credentials_path))
        except (OSError, json.JSONDecodeError):
            missing_files.append(str(credentials_path))
    else:
        missing_files.append(str(credentials_path))

    return WorkspaceConfigResult(
        fields=fields,
        resolved_files=resolved_files,
        missing_files=missing_files,
    )


def resolve_auto_config(
    explicit: Optional[Mapping[str, Any]] = None,
    cwd: Optional[str] = None,
) -> AutoConfigResult:
    """Merge env > explicit > workspace files into a single config result."""
    workspace = load_workspace_config(cwd)
    explicit = explicit or {}

    def _pick(key: str) -> Optional[str]:
        env_map = {
            "api_url": ENV_API_URL,
            "organization_id": ENV_ORGANIZATION_ID,
            "project_id": ENV_PROJECT_ID,
            "instance_id": ENV_INSTANCE_ID,
            "region": ENV_REGION,
            "token": ENV_TOKEN,
        }
        env_name = env_map[key]
        env_val = _trim_str(os.environ.get(env_name, ""))
        if env_val is not None:
            return env_val
        explicit_val = _trim_str(explicit.get(key))
        if explicit_val is not None:
            return explicit_val
        return _trim_str(workspace.fields.get(key))

    streams = explicit.get("streams") if isinstance(explicit.get("streams"), dict) else None
    if not streams:
        streams = workspace.fields.get("streams")
    if isinstance(streams, dict):
        streams = parse_streams_partial(streams)

    return AutoConfigResult(
        api_url=_pick("api_url"),
        organization_id=_pick("organization_id"),
        project_id=_pick("project_id"),
        instance_id=_pick("instance_id"),
        region=_pick("region"),
        streams=streams if isinstance(streams, dict) else None,
        token=_pick("token"),
        resolved_files=list(workspace.resolved_files),
        missing_files=list(workspace.missing_files),
    )


def streams_with_region(
    streams: Optional[dict[str, str]],
    region: Optional[str],
) -> Optional[dict[str, str]]:
    """Ensure top-level ``region`` is available to ``resolve_stream_config``."""
    if not streams and not region:
        return None
    out = dict(streams or {})
    if region and "Region" not in out and "region" not in out:
        out["Region"] = region
    return out or None


def require_auto_config(resolved: AutoConfigResult) -> AutoConfigResult:
    """Raise ``ValidationError`` when ``api_url`` or token cannot be resolved.

    Shared by sync/async ``from_workspace`` so error text stays in one place
    (and matches Node ``requireAutoConfig``).
    """
    if not resolved.api_url:
        missing_project = next(
            (f for f in resolved.missing_files if f.endswith("project.json")),
            None,
        )
        if missing_project:
            raise ValidationError(
                f"Cannot auto-configure: required file is missing: {missing_project}",
                field_errors=[{"field": "api_url", "message": f"File not found: {missing_project}"}],
            )
        raise ValidationError(
            "Cannot auto-configure: api_url could not be resolved from workspace "
            "files, environment, or explicit config",
            field_errors=[{"field": "api_url", "message": "No api_url available"}],
        )

    if not resolved.token:
        missing_cred = next(
            (f for f in resolved.missing_files if f.endswith("credentials.json")),
            None,
        )
        if missing_cred:
            raise ValidationError(
                f"Cannot auto-configure: required file is missing: {missing_cred}",
                field_errors=[{"field": "token", "message": f"File not found: {missing_cred}"}],
            )
        raise ValidationError(
            "Cannot auto-configure: auth token could not be resolved from workspace "
            "files, environment, or explicit config",
            field_errors=[{"field": "token", "message": "No auth token available"}],
        )

    return resolved
