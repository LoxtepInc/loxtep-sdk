/**
 * Define facade (MCP: loxtep_define).
 * Delegates to schemas (data-product), shapes (domain canonical), quality,
 * standards, data_contracts, and domains APIs.
 */

import type { createSchemasApi } from './schemas.js';
import type { createShapesApi } from './shapes.js';
import type { createQualityApi } from './quality.js';
import type { createStandardsApi } from './standards.js';
import type { createPromisesApi } from './promises.js';
import type { createDomainsApi } from './domains.js';

export interface DefineFacadeDeps {
  schemas: ReturnType<typeof createSchemasApi>;
  shapes: ReturnType<typeof createShapesApi>;
  quality: ReturnType<typeof createQualityApi>;
  standards: ReturnType<typeof createStandardsApi>;
  data_contracts: ReturnType<typeof createPromisesApi>;
  domains: ReturnType<typeof createDomainsApi>;
}

export function createDefineFacade(deps: DefineFacadeDeps): {
  schemas: DefineFacadeDeps['schemas'];
  shapes: DefineFacadeDeps['shapes'];
  quality: DefineFacadeDeps['quality'];
  standards: DefineFacadeDeps['standards'];
  data_contracts: DefineFacadeDeps['data_contracts'];
  domains: DefineFacadeDeps['domains'];
} {
  return {
    schemas: deps.schemas,
    shapes: deps.shapes,
    quality: deps.quality,
    standards: deps.standards,
    data_contracts: deps.data_contracts,
    domains: deps.domains,
  };
}

export type DefineFacade = ReturnType<typeof createDefineFacade>;
