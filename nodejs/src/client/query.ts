/**
 * Query facade (MCP: loxtep_query).
 * Delegates to catalog, discovery, and data-product query/analytics methods.
 */

import type { createCatalogApi } from './catalog.js';
import type { createDiscoveryApi } from './discovery.js';
import type { createDataProductsApi } from './data-products.js';

export interface QueryFacadeDeps {
  catalog: ReturnType<typeof createCatalogApi>;
  discovery: ReturnType<typeof createDiscoveryApi>;
  data_products: ReturnType<typeof createDataProductsApi>;
}

export function createQueryFacade(deps: QueryFacadeDeps): {
  catalog: QueryFacadeDeps['catalog'];
  discovery: QueryFacadeDeps['discovery'];
  query: ReturnType<typeof createDataProductsApi>['query'];
  list_tables: ReturnType<typeof createDataProductsApi>['list_tables'];
  search: ReturnType<typeof createDataProductsApi>['search'];
} {
  return {
    catalog: deps.catalog,
    discovery: deps.discovery,
    query: deps.data_products.query.bind(deps.data_products),
    list_tables: deps.data_products.list_tables.bind(deps.data_products),
    search: deps.data_products.search.bind(deps.data_products),
  };
}

export type QueryFacade = ReturnType<typeof createQueryFacade>;
