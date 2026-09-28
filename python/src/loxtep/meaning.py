"""Meaning facade (MCP: loxtep_meaning).

Thesaurus + proposals + bundles (Phase 2). Ontology / packs / semantic remain
Node-first until ported.
"""

from __future__ import annotations

from dataclasses import dataclass

from .bundles import BundlesApi
from .proposals import ProposalsApi
from .thesaurus import ThesaurusApi


@dataclass(frozen=True)
class MeaningFacade:
    thesaurus: ThesaurusApi
    proposals: ProposalsApi
    bundles: BundlesApi
