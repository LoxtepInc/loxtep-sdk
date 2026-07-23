/**
 * Meaning facade (MCP: loxtep_meaning).
 * Delegates to thesaurus API (ontology/semantic REST modules not yet split in SDK).
 */

import type { createThesaurusApi } from './thesaurus.js';

export interface MeaningFacadeDeps {
  thesaurus: ReturnType<typeof createThesaurusApi>;
}

export function createMeaningFacade(deps: MeaningFacadeDeps): {
  thesaurus: MeaningFacadeDeps['thesaurus'];
} {
  return {
    thesaurus: deps.thesaurus,
  };
}

export type MeaningFacade = ReturnType<typeof createMeaningFacade>;
