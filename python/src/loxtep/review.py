"""Review facade (MCP: loxtep_review)."""

from __future__ import annotations

from dataclasses import dataclass

from .improvements import ImprovementsApi


class ApprovalsApiStub:
    """Approvals REST not yet ported to Python SDK — use MCP `loxtep_review` (`list_pending`, `resolve`)."""

    unavailable: bool = True


@dataclass(frozen=True)
class ReviewFacade:
    approvals: ApprovalsApiStub
    improvements: ImprovementsApi
