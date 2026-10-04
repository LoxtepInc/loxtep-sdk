/**
 * Meaning facade (MCP: loxtep_meaning).
 * Thesaurus + ontology + vocabulary packs + semantic search/completeness +
 * proposals + bundles + packages.
 */

import type { createThesaurusApi } from './thesaurus.js';
import type { createOntologyApi } from './ontology.js';
import type { createPacksApi } from './packs.js';
import type { createSemanticLayerApi } from './semantic-layer.js';
import type { createProposalsApi } from './proposals.js';
import type { createBundlesApi } from './bundles.js';
import type { createPackagesApi } from './packages.js';

export interface MeaningFacadeDeps {
  thesaurus: ReturnType<typeof createThesaurusApi>;
  ontology: ReturnType<typeof createOntologyApi>;
  packs: ReturnType<typeof createPacksApi>;
  semantic: ReturnType<typeof createSemanticLayerApi>;
  proposals: ReturnType<typeof createProposalsApi>;
  bundles: ReturnType<typeof createBundlesApi>;
  packages: ReturnType<typeof createPackagesApi>;
}

export function createMeaningFacade(deps: MeaningFacadeDeps): {
  thesaurus: MeaningFacadeDeps['thesaurus'];
  ontology: MeaningFacadeDeps['ontology'];
  packs: MeaningFacadeDeps['packs'];
  semantic: MeaningFacadeDeps['semantic'];
  proposals: MeaningFacadeDeps['proposals'];
  bundles: MeaningFacadeDeps['bundles'];
  packages: MeaningFacadeDeps['packages'];
} {
  return {
    thesaurus: deps.thesaurus,
    ontology: deps.ontology,
    packs: deps.packs,
    semantic: deps.semantic,
    proposals: deps.proposals,
    bundles: deps.bundles,
    packages: deps.packages,
  };
}

export type MeaningFacade = ReturnType<typeof createMeaningFacade>;
