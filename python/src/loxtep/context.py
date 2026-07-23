"""Context facade (MCP: loxtep_process_intel + loxtep_procedures + activity)."""

from __future__ import annotations

from dataclasses import dataclass

from .activity import ActivityApi
from .procedures import ProceduresApi
from .process_intelligence import ProcessIntelligenceApi


@dataclass(frozen=True)
class ContextFacade:
    process_intelligence: ProcessIntelligenceApi
    procedures: ProceduresApi
    activity: ActivityApi
