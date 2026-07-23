/**
 * Define facade (MCP: loxtep_schemas + loxtep_quality + domains/standards/contracts catalog ops).
 * Delegates to schemas, quality, standards, data_contracts, and domains APIs.
 */

import type { createSchemasApi } from './schemas.js';
import type { createQualityApi } from './quality.js';
import type { createStandardsApi } from './standards.js';
import type { createPromisesApi } from './promises.js';
import type { createDomainsApi } from './domains.js';

export interface DefineFacadeDeps {
  schemas: ReturnType<typeof createSchemasApi>;
  quality: ReturnType<typeof createQualityApi>;
  standards: ReturnType<typeof createStandardsApi>;
  data_contracts: ReturnType<typeof createPromisesApi>;
  domains: ReturnType<typeof createDomainsApi>;
}

export function createDefineFacade(deps: DefineFacadeDeps): {
  schemas: DefineFacadeDeps['schemas'];
  quality: DefineFacadeDeps['quality'];
  standards: DefineFacadeDeps['standards'];
  data_contracts: DefineFacadeDeps['data_contracts'];
  domains: DefineFacadeDeps['domains'];
} {
  return {
    schemas: deps.schemas,
    quality: deps.quality,
    standards: deps.standards,
    data_contracts: deps.data_contracts,
    domains: deps.domains,
  };
}

export type DefineFacade = ReturnType<typeof createDefineFacade>;
