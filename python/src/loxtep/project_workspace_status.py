"""
Pure project workspace status builder (Node `project-workspace-status` parity).

Callers supply already-loaded local/cloud/deployments so this stays unit-testable
without IO. Full unpublished FS inventory still lives in the Node CLI path.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Literal, Optional

from .deployments import pick_latest_deployment

StatusPopulationDepth = Literal["summary", "status", "unpublished"]
AttachState = Literal["attached", "unattached"]
GithubLinkState = Literal["linked", "unbound"]
DeployedLayerState = Literal["deployed", "stale", "never_deployed", "unknown"]
NextActionHint = Literal["clone", "attach", "push", "deploy", "none"]


def attach_state_from_local(local: Optional[dict[str, Any]]) -> AttachState:
    if not local:
        return "unattached"
    if local.get("instance_id") and local.get("api_url"):
        return "attached"
    return "unattached"


def github_state_from_project(project: Optional[dict[str, Any]]) -> GithubLinkState:
    if project and (project.get("github_repo_url") or project.get("github_repo_name")):
        return "linked"
    return "unbound"


def derive_next_action(
    *,
    local_present: bool,
    attach_state: AttachState,
    github_state: GithubLinkState,
    deployed_state: DeployedLayerState,
    local_to_cloud_dirty: Optional[bool],
    cloud_to_deployed_dirty: Optional[bool],
) -> NextActionHint:
    if not local_present:
        return "clone"
    if attach_state == "unattached":
        return "attach"
    if github_state == "unbound" and local_to_cloud_dirty is True:
        return "push"
    if local_to_cloud_dirty is True:
        return "push"
    if deployed_state == "never_deployed" or cloud_to_deployed_dirty is True:
        return "deploy"
    if deployed_state == "stale":
        return "deploy"
    return "none"


def _age_seconds(iso: Optional[str], now_ms: float) -> Optional[int]:
    if not iso:
        return None
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp() * 1000
    except ValueError:
        return None
    return max(0, int((now_ms - t) / 1000))


def _parse_ms(iso: Optional[str]) -> Optional[float]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp() * 1000
    except ValueError:
        return None


def resolve_deployed_layer(
    *,
    deployments: Optional[list[dict[str, Any]]],
    deployments_unavailable: bool,
    attached_instance_id: Optional[str],
    cloud: Optional[dict[str, Any]],
    now_ms: float,
) -> dict[str, Any]:
    if deployments_unavailable:
        return {
            "presence": "unknown",
            "state": "unknown",
            "instance_id": attached_instance_id,
            "deployment_id": None,
            "deployment_status": None,
            "last_deployed_at": None,
            "age_seconds": None,
            "cloud_to_deployed_dirty": None,
            "cloud_to_deployed_summary": "Deploy API unavailable",
        }
    if deployments is None:
        return {
            "presence": "unknown",
            "state": "unknown",
            "instance_id": attached_instance_id,
            "deployment_id": None,
            "deployment_status": None,
            "last_deployed_at": None,
            "age_seconds": None,
            "cloud_to_deployed_dirty": None,
            "cloud_to_deployed_summary": None,
        }

    latest = pick_latest_deployment(deployments)
    if not latest or latest.get("status") != "deployed":
        pending = latest if latest and latest.get("status") != "deployed" else None
        return {
            "presence": "absent",
            "state": "never_deployed",
            "instance_id": attached_instance_id,
            "deployment_id": (pending or {}).get("deployment_id"),
            "deployment_status": (pending or {}).get("status"),
            "last_deployed_at": None,
            "age_seconds": None,
            "cloud_to_deployed_dirty": True,
            "cloud_to_deployed_summary": "Never deployed",
        }

    last_deployed_at = latest.get("updated_at") or latest.get("created_at")
    sync_ms = _parse_ms((cloud or {}).get("github_last_sync_at"))
    deploy_ms = _parse_ms(last_deployed_at)
    stale = (
        sync_ms is not None and deploy_ms is not None and sync_ms > deploy_ms + 1000
    )
    return {
        "presence": "present",
        "state": "stale" if stale else "deployed",
        "instance_id": latest.get("instance_id") or attached_instance_id,
        "deployment_id": latest.get("deployment_id"),
        "deployment_status": latest.get("status"),
        "last_deployed_at": last_deployed_at,
        "age_seconds": _age_seconds(last_deployed_at, now_ms),
        "cloud_to_deployed_dirty": stale,
        "cloud_to_deployed_summary": (
            "Cloud ahead of last deploy (stale)"
            if stale
            else "Deployed matches known cloud revision"
        ),
    }


def _resolve_local_to_cloud(
    *,
    depth: StatusPopulationDepth,
    local_git_dirty: Optional[bool],
    local_to_cloud_inventory: Optional[dict[str, Any]],
) -> dict[str, Any]:
    if depth not in ("status", "unpublished"):
        return {"dirty": None, "summary": None, "changed_count": None, "changes": []}

    if local_to_cloud_inventory is not None:
        inv = local_to_cloud_inventory
        return {
            "dirty": inv.get("dirty"),
            "summary": inv.get("summary"),
            "changed_count": inv.get("changed_count") if depth == "unpublished" else None,
            "changes": (inv.get("changes") or []) if depth == "unpublished" else [],
        }

    if local_git_dirty is not None:
        return {
            "dirty": local_git_dirty,
            "summary": (
                "Local package has unpublished changes"
                if local_git_dirty
                else "Local matches known cloud revision"
            ),
            "changed_count": None,
            "changes": [],
        }

    return {"dirty": None, "summary": None, "changed_count": None, "changes": []}


def build_project_workspace_status(input: dict[str, Any]) -> dict[str, Any]:
    """Pure builder for project workspace status (schema_version 1)."""
    depth: StatusPopulationDepth = input.get("population_depth") or "status"
    now_ms = float(input.get("now_ms") if input.get("now_ms") is not None else time.time() * 1000)
    notes = list(input.get("notes") or [])
    local = input.get("local")
    cloud = input.get("cloud")

    attach_state = attach_state_from_local(local)
    github_state = github_state_from_project(cloud)
    l2c = _resolve_local_to_cloud(
        depth=depth,
        local_git_dirty=input.get("local_git_dirty"),
        local_to_cloud_inventory=input.get("local_to_cloud_inventory"),
    )

    if depth == "summary":
        deployed_layer = {
            "presence": "unknown",
            "state": "unknown",
            "instance_id": (local or {}).get("instance_id"),
            "deployment_id": None,
            "deployment_status": None,
            "last_deployed_at": None,
            "age_seconds": None,
            "cloud_to_deployed_dirty": None,
            "cloud_to_deployed_summary": None,
        }
    else:
        deployed_layer = resolve_deployed_layer(
            deployments=input.get("deployments"),
            deployments_unavailable=bool(input.get("deployments_unavailable")),
            attached_instance_id=(local or {}).get("instance_id"),
            cloud=cloud,
            now_ms=now_ms,
        )

    if input.get("deployments_unavailable"):
        notes.append("Deployments list unavailable; deployed layer marked unknown.")

    c2d_dirty = deployed_layer["cloud_to_deployed_dirty"]
    c2d_summary = deployed_layer["cloud_to_deployed_summary"]
    c2d_changed_count = None
    c2d_changes: list[Any] = []

    # Optional precomputed cloud→deployed inventory (FS inventory stays Node-side).
    c2d_inv = input.get("cloud_to_deployed_inventory")
    if depth == "unpublished" and isinstance(c2d_inv, dict):
        c2d_dirty = c2d_inv.get("dirty", c2d_dirty)
        c2d_summary = c2d_inv.get("summary", c2d_summary)
        c2d_changed_count = c2d_inv.get("changed_count")
        c2d_changes = c2d_inv.get("changes") or []

    next_action = derive_next_action(
        local_present=local is not None,
        attach_state=attach_state,
        github_state=github_state,
        deployed_state=deployed_layer["state"],
        local_to_cloud_dirty=l2c["dirty"],
        cloud_to_deployed_dirty=c2d_dirty,
    )

    return {
        "schema_version": 1,
        "population_depth": depth,
        "project_id": (cloud or {}).get("project_id") or (local or {}).get("project_id"),
        "display_name": (cloud or {}).get("name"),
        "local": {
            "presence": "present" if local else "absent",
            "path": (local or {}).get("path"),
            "project_file": (local or {}).get("project_file"),
            "known_local": bool(input.get("known_local")) or local is not None,
            "attach_state": attach_state,
            "instance_id": (local or {}).get("instance_id"),
            "api_url": (local or {}).get("api_url"),
            "project_id": (local or {}).get("project_id"),
        },
        "cloud": {
            "presence": "present" if cloud else ("unknown" if local else "absent"),
            "project_id": (cloud or {}).get("project_id"),
            "organization_id": (cloud or {}).get("organization_id"),
            "name": (cloud or {}).get("name"),
            "status": (cloud or {}).get("status"),
            "github": {
                "state": github_state,
                "url": (cloud or {}).get("github_repo_url"),
                "name": (cloud or {}).get("github_repo_name"),
                "branch": (cloud or {}).get("github_branch")
                or (cloud or {}).get("repository_branch"),
                "last_sync_at": (cloud or {}).get("github_last_sync_at"),
            },
            "workspace_revision": (cloud or {}).get("github_last_commit_sha"),
            "workspace_updated_at": (cloud or {}).get("updated_at"),
        },
        "deployed": {
            "presence": deployed_layer["presence"],
            "state": deployed_layer["state"],
            "instance_id": deployed_layer["instance_id"],
            "deployment_id": deployed_layer["deployment_id"],
            "deployment_status": deployed_layer["deployment_status"],
            "last_deployed_at": deployed_layer["last_deployed_at"],
            "age_seconds": deployed_layer["age_seconds"],
        },
        "unpublished": {
            "local_to_cloud": {
                "dirty": l2c["dirty"],
                "summary": l2c["summary"],
                "changed_count": l2c["changed_count"],
                "changes": l2c["changes"],
            },
            "cloud_to_deployed": {
                "dirty": c2d_dirty,
                "summary": c2d_summary,
                "changed_count": c2d_changed_count,
                "changes": c2d_changes,
            },
        },
        "next_action": next_action,
        "notes": notes,
    }


def format_project_workspace_status_lines(status: dict[str, Any]) -> list[str]:
    """One-screen human rendering for status (CLI-friendly)."""
    project_id = status.get("project_id") or "(unknown)"
    name = status.get("display_name") or "(unnamed)"
    local = status.get("local") or {}
    cloud = status.get("cloud") or {}
    deployed = status.get("deployed") or {}
    unpublished = status.get("unpublished") or {}
    attach = local.get("attach_state")
    host = local.get("api_url") or "(no api_url)"
    instance = local.get("instance_id") or "(none)"
    github = (cloud.get("github") or {}).get("state")
    lines = [
        f"Project: {name} ({project_id})",
        f"Local:   {local.get('presence')} path={local.get('path') or '(none)'} attach={attach}",
        f"Host:    {host} instance={instance}",
        f"Cloud:   {cloud.get('presence')} github={github}",
        f"Deploy:  {deployed.get('state')} id={deployed.get('deployment_id') or '(none)'}",
        f"Next:    {status.get('next_action')}",
    ]
    l2c = unpublished.get("local_to_cloud") or {}
    c2d = unpublished.get("cloud_to_deployed") or {}
    if l2c.get("summary") or c2d.get("summary"):
        lines.append(f"Dirty:   L→C={l2c.get('summary') or '—'} | C→D={c2d.get('summary') or '—'}")
    notes = status.get("notes") or []
    if notes:
        lines.append(f"Notes:   {'; '.join(notes)}")
    return lines
