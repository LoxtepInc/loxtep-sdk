/**
 * Meaning facade (MCP: loxtep_meaning).
 * Thesaurus vocabulary + ontology concepts/relationships REST.
 */

import type { createThesaurusApi } from './thesaurus.js';
import type { createOntologyApi } from './ontology.js';

export interface MeaningFacadeDeps {
  thesaurus: ReturnType<typeof createThesaurusApi>;
  ontology: ReturnType<typeof createOntologyApi>;
}

export function createMeaningFacade(deps: MeaningFacadeDeps): {
  thesaurus: MeaningFacadeDeps['thesaurus'];
  ontology: MeaningFacadeDeps['ontology'];
} {
  return {
    thesaurus: deps.thesaurus,
    ontology: deps.ontology,
  };
}

export type MeaningFacade = ReturnType<typeof createMeaningFacade>;
