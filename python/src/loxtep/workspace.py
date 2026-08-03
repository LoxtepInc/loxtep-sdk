"""Workspace facade (MCP: loxtep_workspace)."""

from __future__ import annotations

from dataclasses import dataclass

from .instances import InstancesApi
from .projects import ProjectsApi


@dataclass(frozen=True)
class VersionsFacade:
    unavailable: bool = True


@dataclass(frozen=True)
class WorkspaceFacade:
    projects: ProjectsApi
    instances: InstancesApi
    versions: VersionsFacade = VersionsFacade()
