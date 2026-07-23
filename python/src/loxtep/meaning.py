"""Meaning facade (MCP: loxtep_ontology + loxtep_semantic_layer)."""

from __future__ import annotations

from dataclasses import dataclass

from .thesaurus import ThesaurusApi


@dataclass(frozen=True)
class MeaningFacade:
    thesaurus: ThesaurusApi
