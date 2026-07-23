"""Review facade (MCP: loxtep_approvals + improvements)."""

from __future__ import annotations

from dataclasses import dataclass

from .improvements import ImprovementsApi


class ApprovalsApiStub:
    """Approvals REST not yet ported to Python SDK — use MCP loxtep_approvals."""

    unavailable: bool = True


@dataclass(frozen=True)
class ReviewFacade:
    approvals: ApprovalsApiStub
    improvements: ImprovementsApi
