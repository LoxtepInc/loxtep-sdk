"""Build facade (MCP: loxtep_build)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .data_products import DataProductsApi
from .targets import TargetsApi
from .triggers import TriggersApi
from .workflows import WorkflowsApi


@dataclass
class BuildFacade:
    workflows: WorkflowsApi
    triggers: TriggersApi
    data_products: DataProductsApi
    targets: TargetsApi

    def get_writer(self, workflow_id: str, **options: Any) -> Any:
        return self.workflows.get_writer(workflow_id, **options)
