/**
 * Meaning facade (MCP: loxtep_meaning).
 * Thesaurus vocabulary + ontology concepts/relationships + vocabulary packs.
 */

import type { createThesaurusApi } from './thesaurus.js';
import type { createOntologyApi } from './ontology.js';
import type { createPacksApi } from './packs.js';

export interface MeaningFacadeDeps {
  thesaurus: ReturnType<typeof createThesaurusApi>;
  ontology: ReturnType<typeof createOntologyApi>;
  packs: ReturnType<typeof createPacksApi>;
}

export function createMeaningFacade(deps: MeaningFacadeDeps): {
  thesaurus: MeaningFacadeDeps['thesaurus'];
  ontology: MeaningFacadeDeps['ontology'];
  packs: MeaningFacadeDeps['packs'];
} {
  return {
    thesaurus: deps.thesaurus,
    ontology: deps.ontology,
    packs: deps.packs,
  };
}

export type MeaningFacade = ReturnType<typeof createMeaningFacade>;
