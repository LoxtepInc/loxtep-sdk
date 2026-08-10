/**
 * Meaning facade (MCP: loxtep_meaning).
 * Thesaurus + ontology + vocabulary packs + semantic search/completeness.
 */

import type { createThesaurusApi } from './thesaurus.js';
import type { createOntologyApi } from './ontology.js';
import type { createPacksApi } from './packs.js';
import type { createSemanticLayerApi } from './semantic-layer.js';

export interface MeaningFacadeDeps {
  thesaurus: ReturnType<typeof createThesaurusApi>;
  ontology: ReturnType<typeof createOntologyApi>;
  packs: ReturnType<typeof createPacksApi>;
  semantic: ReturnType<typeof createSemanticLayerApi>;
}

export function createMeaningFacade(deps: MeaningFacadeDeps): {
  thesaurus: MeaningFacadeDeps['thesaurus'];
  ontology: MeaningFacadeDeps['ontology'];
  packs: MeaningFacadeDeps['packs'];
  semantic: MeaningFacadeDeps['semantic'];
} {
  return {
    thesaurus: deps.thesaurus,
    ontology: deps.ontology,
    packs: deps.packs,
    semantic: deps.semantic,
  };
}

export type MeaningFacade = ReturnType<typeof createMeaningFacade>;
