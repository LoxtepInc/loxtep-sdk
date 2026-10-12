"""Meaning facade (MCP: loxtep_meaning).

Thesaurus + proposals + bundles + packages, plus ontology relationship
discovery/accept and semantic glossary binding apply.
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
    ontology: Any
    semantic: Any
