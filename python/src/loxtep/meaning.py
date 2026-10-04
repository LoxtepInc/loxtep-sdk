"""Meaning facade (MCP: loxtep_meaning).

Thesaurus + proposals + bundles + packages. Ontology / packs / semantic remain
Node-first until ported.
"""

from __future__ import annotations

from dataclasses import dataclass

from typing import Any

from .proposals import ProposalsApi
from .thesaurus import ThesaurusApi


@dataclass(frozen=True)
class MeaningFacade:
    thesaurus: ThesaurusApi | Any
    proposals: ProposalsApi | Any
    bundles: Any
    packages: Any
