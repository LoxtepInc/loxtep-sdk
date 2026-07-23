"""Meaning facade (MCP: loxtep_meaning)."""

from __future__ import annotations

from dataclasses import dataclass

from .thesaurus import ThesaurusApi


@dataclass(frozen=True)
class MeaningFacade:
    thesaurus: ThesaurusApi
