"""Workspace facade (MCP: loxtep_workspace)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Union

from .deployments import AsyncDeploymentsApi, DeploymentsApi
from .instances import AsyncInstancesApi, InstancesApi
from .projects import AsyncProjectsApi, ProjectsApi


@dataclass(frozen=True)
class VersionsFacade:
    unavailable: bool = True


@dataclass(frozen=True)
class WorkspaceFacade:
    projects: Union[ProjectsApi, AsyncProjectsApi]
    instances: Union[InstancesApi, AsyncInstancesApi]
    deployments: Union[DeploymentsApi, AsyncDeploymentsApi]
    versions: VersionsFacade = field(default_factory=VersionsFacade)
