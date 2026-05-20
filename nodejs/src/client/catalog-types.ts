/**
 * Catalog (search) API types. snake_case per backend conventions.
 */

export interface CatalogSearchFilters {
  type?: 'data_product' | 'project' | 'domain';
  limit?: number;
  offset?: number;
}

export interface CatalogSearchResultItem {
  id?: string;
  type?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface CatalogSearchResponse {
  success?: boolean;
  results?: CatalogSearchResultItem[];
  totalCount?: number;
  facets?: Record<string, unknown>;
}
