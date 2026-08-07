"""Review facade (MCP: loxtep_review)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Union

from .approvals import ApprovalsApi, AsyncApprovalsApi
from .improvements import AsyncImprovementsApi, ImprovementsApi


@dataclass(frozen=True)
class ReviewFacade:
    approvals: Union[ApprovalsApi, AsyncApprovalsApi]
    improvements: Union[ImprovementsApi, AsyncImprovementsApi]
