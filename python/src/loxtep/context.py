"""Context facade (MCP: loxtep_context)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .activity import ActivityApi
from .procedures import ProceduresApi
from .process_intelligence import ProcessIntelligenceApi


@dataclass(frozen=True)
class ContextFacade:
    _grounding: Any
    process_intelligence: ProcessIntelligenceApi
    procedures: ProceduresApi
    activity: ActivityApi
    # Sync or async IssuesApi / GoalsApi / WorkstreamsApi (client wires concrete).
    issues: Any
    goals: Any
    workstreams: Any

    def query(self, **kwargs: Any) -> Any:
        return self._grounding.query(**kwargs)

    def check_readiness(self, **kwargs: Any) -> Any:
        return self._grounding.check_readiness(**kwargs)

    def check_answerability(self, **kwargs: Any) -> Any:
        return self._grounding.check_answerability(**kwargs)
