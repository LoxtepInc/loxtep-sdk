"""
CLI config and credentials. Same paths as Node.js CLI: ~/.loxtep/config.json, ~/.loxtep/credentials.json.
Includes config export helpers for SDK connector bootstrap.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional, TypedDict

from .project_context import PROJECT_DIR_NAME

CONFIG_DIR_ENV = "LOXTEP_CONFIG_DIR"
CONFIG_FILE = "config.json"
CREDENTIALS_FILE = "credentials.json"


class SdkConfig(TypedDict, total=False):
    """SDK connector config shape returned in ``metadata.sdk_config``."""

    api_url: str
    organization_id: str
    project_id: str
    instance_id: str
    region: str


def _config_dir() -> Path:
    if os.environ.get(CONFIG_DIR_ENV):
        return Path(os.environ[CONFIG_DIR_ENV])
    return Path.home() / ".loxtep"


def _config_path() -> Path:
    return _config_dir() / CONFIG_FILE


def _global_credentials_path() -> Path:
    return _config_dir() / CREDENTIALS_FILE


def _find_local_credentials_dir(cwd: Optional[str] = None) -> Optional[Path]:
    """Walk from `cwd` upward, returning the first directory containing
    `.loxtep/credentials.json`, or None if none is found.

    Port of Node's `findLocalCredentialsDir` (nodejs/src/cli/credentials.ts) — a
    project directory can carry its own `.loxtep/credentials.json` (written by
    `loxtep login` without `--global`), which must be preferred over the global
    `~/.loxtep/credentials.json` when both exist.
    """
    directory = Path(cwd or os.getcwd()).resolve()
    while True:
        if (directory / PROJECT_DIR_NAME / CREDENTIALS_FILE).exists():
            return directory
        if directory.parent == directory:
            return None
        directory = directory.parent


def _resolve_credentials_path(cwd: Optional[str] = None) -> Path:
    """Resolve which credentials file to read: a project-local
    `.loxtep/credentials.json` found by walking up from `cwd`, else the global
    `~/.loxtep/credentials.json` (or `LOXTEP_CONFIG_DIR` override). Matches Node's
    `resolveCredentialsPath` local-first precedence.
    """
    local_dir = _find_local_credentials_dir(cwd)
    if local_dir is not None:
        return local_dir / PROJECT_DIR_NAME / CREDENTIALS_FILE
    return _global_credentials_path()


def load_config(cwd: Optional[str] = None) -> dict[str, Optional[str]]:
    """
    Load config from env, ~/.loxtep/config.json, then credentials.json's `api_base_url`.
    Precedence (matches Node's `resolveCliApiUrl`): LOXTEP_API_URL env → explicit config
    file api_url → credentials api_base_url (persisted by `loxtep login`) → unset.

    Reading `api_base_url` here is itself a bug-parity fix: Node's headless
    `login --console` previously didn't persist `api_base_url` at all, so any command run
    afterward without LOXTEP_API_URL silently fell back to the production default. Node
    now persists it; Python must read it so a dev/staging login is actually honored.

    `cwd` is forwarded to `load_credentials` so a project-local `.loxtep/credentials.json`
    (found by walking up from `cwd`) is preferred over the global one — see `load_credentials`.
    Returns dict with api_url, organization_id, project_id (values may be None).
    """
    result: dict[str, Optional[str]] = {
        "api_url": os.environ.get("LOXTEP_API_URL", "").strip() or None,
        "organization_id": os.environ.get("LOXTEP_ORGANIZATION_ID", "").strip() or None,
        "project_id": os.environ.get("LOXTEP_PROJECT_ID", "").strip() or None,
    }
    path = _config_path()
    if path.exists():
        try:
            raw = path.read_text(encoding="utf-8")
            data: dict[str, Any] = json.loads(raw)
            if isinstance(data, dict):
                if result["api_url"] is None and isinstance(data.get("api_url"), str):
                    result["api_url"] = data["api_url"]
                if result["organization_id"] is None and isinstance(data.get("organization_id"), str):
                    result["organization_id"] = data["organization_id"]
                if result["project_id"] is None and isinstance(data.get("project_id"), str):
                    result["project_id"] = data["project_id"]
        except (OSError, json.JSONDecodeError):
            pass
    if result["api_url"] is None:
        creds = load_credentials(cwd)
        if creds and creds.get("api_base_url"):
            result["api_url"] = creds["api_base_url"]
    return result


def load_credentials(cwd: Optional[str] = None) -> Optional[dict[str, str]]:
    """
    Load credentials, preferring a project-local `.loxtep/credentials.json` (found by
    walking up from `cwd`, default `os.getcwd()`) over the global
    `~/.loxtep/credentials.json` — matches Node's local-first `resolveCredentialsPath`
    (nodejs/src/cli/credentials.ts). Returns dict with access_token (and optionally
    refresh_token, expires_at, api_base_url) or None if missing/invalid.
    """
    path = _resolve_credentials_path(cwd)
    if not path.exists():
        return None
    try:
        raw = path.read_text(encoding="utf-8")
        data: dict[str, Any] = json.loads(raw)
        token = data.get("access_token") if isinstance(data, dict) else None
        if not isinstance(token, str):
            return None
        out: dict[str, str] = {"access_token": token}
        if isinstance(data.get("refresh_token"), str):
            out["refresh_token"] = data["refresh_token"]
        if isinstance(data.get("expires_at"), str):
            out["expires_at"] = data["expires_at"]
        if isinstance(data.get("api_base_url"), str) and data["api_base_url"].strip():
            out["api_base_url"] = data["api_base_url"].strip().rstrip("/")
        return out
    except (OSError, json.JSONDecodeError):
        return None


def get_token_from_env_or_file(cwd: Optional[str] = None) -> Optional[str]:
    """Token from LOXTEP_TOKEN env, else credentials.json access_token (project-local
    first, then global — see `load_credentials`)."""
    token = os.environ.get("LOXTEP_TOKEN", "").strip()
    if token:
        return token
    creds = load_credentials(cwd)
    return creds.get("access_token") if creds else None


# ---------------------------------------------------------------------------
#  Config export formatting helpers (exported for tests)
# ---------------------------------------------------------------------------


def _sdk_config_to_env_entries(config: SdkConfig) -> list[tuple[str, str]]:
    """Build env-var key-value pairs from an SdkConfig."""
    entries: list[tuple[str, str]] = []
    entries.append(("LOXTEP_API_URL", config["api_url"]))
    entries.append(("LOXTEP_ORGANIZATION_ID", config["organization_id"]))
    if config.get("project_id") is not None:
        entries.append(("LOXTEP_PROJECT_ID", config["project_id"]))
    if config.get("instance_id") is not None:
        entries.append(("LOXTEP_INSTANCE_ID", config["instance_id"]))
    if config.get("region") is not None:
        entries.append(("LOXTEP_REGION", config["region"]))
    return entries


def format_sdk_config_as_shell(config: SdkConfig) -> str:
    """Format an SdkConfig as POSIX shell export lines.

    Example::

        export LOXTEP_API_URL="https://api.loxtep.io"
    """
    return "\n".join(f'export {k}="{v}"' for k, v in _sdk_config_to_env_entries(config))


def format_sdk_config_as_json(config: SdkConfig) -> str:
    """Format an SdkConfig as a JSON object mapping field names to values."""
    obj: dict[str, str] = {}
    obj["api_url"] = config["api_url"]
    obj["organization_id"] = config["organization_id"]
    if config.get("project_id") is not None:
        obj["project_id"] = config["project_id"]
    if config.get("instance_id") is not None:
        obj["instance_id"] = config["instance_id"]
    if config.get("region") is not None:
        obj["region"] = config["region"]
    return json.dumps(obj, indent=2)


def format_sdk_config_as_env(config: SdkConfig) -> str:
    """Format an SdkConfig as ``.env`` file lines (no ``export`` prefix).

    Example::

        LOXTEP_API_URL=https://api.loxtep.io
    """
    return "\n".join(f"{k}={v}" for k, v in _sdk_config_to_env_entries(config))


# ---------------------------------------------------------------------------
#  config export --from-connector
# ---------------------------------------------------------------------------


def run_config_export_from_connector(
    connector_id: str,
    *,
    fmt: str = "sh",
) -> int:
    """Fetch an SDK connector and output its sdk_config in the requested format.

    Returns 0 on success, 1 on error.
    """
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print(
            "Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)",
            file=sys.stderr,
        )
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1

    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        try:
            connector = client.connect.connectors.get(connector_id)
        except Exception as exc:
            print(
                f"Error: Connector '{connector_id}' not found. {exc}",
                file=sys.stderr,
            )
            return 1

        connector_type = connector.get("connector_type")
        if connector_type != "sdk":
            print(
                f"Error: Connector '{connector_id}' is type '{connector_type}', not 'sdk'. "
                "Use --from-data-product for non-SDK connectors.",
                file=sys.stderr,
            )
            return 1

        metadata = connector.get("metadata") or {}
        sdk_config_raw = metadata.get("sdk_config")
        if (
            not isinstance(sdk_config_raw, dict)
            or not sdk_config_raw.get("api_url")
            or not sdk_config_raw.get("organization_id")
        ):
            print(
                f"Error: Connector '{connector_id}' is missing sdk_config in metadata. "
                "The connector may need to be recreated.",
                file=sys.stderr,
            )
            return 1

        sdk_cfg: SdkConfig = {
            "api_url": sdk_config_raw["api_url"],
            "organization_id": sdk_config_raw["organization_id"],
        }
        if sdk_config_raw.get("project_id") is not None:
            sdk_cfg["project_id"] = sdk_config_raw["project_id"]
        if sdk_config_raw.get("instance_id") is not None:
            sdk_cfg["instance_id"] = sdk_config_raw["instance_id"]
        if sdk_config_raw.get("region") is not None:
            sdk_cfg["region"] = sdk_config_raw["region"]

        if fmt == "json":
            print(format_sdk_config_as_json(sdk_cfg))
        elif fmt == "env":
            print(format_sdk_config_as_env(sdk_cfg))
        else:
            print(format_sdk_config_as_shell(sdk_cfg))

        return 0
    finally:
        client.close()
