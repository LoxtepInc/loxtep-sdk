/**
 * Templates API types (catalog).
 * Canonical API: GET /templates, GET /templates/:template_id (dataproducts).
 * snake_case per backend conventions.
 */

/** Template summary (catalog item). */
export interface TemplateSummary {
  template_id: string;
  name: string;
  description: string | null;
  category: string;
  version: string;
  configuration: Record<string, unknown>;
  validation_rules: Record<string, unknown>;
  metadata: Record<string, unknown>;
  is_public: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Pagination (same shape as other list endpoints). */
export interface TemplatesPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** List templates response. */
export interface TemplatesListResponse {
  success: true;
  data: {
    items: TemplateSummary[];
    pagination: TemplatesPagination;
  };
}

/** List filters (query params). */
export interface TemplatesListFilters {
  category?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

/** Apply template body (POST /workflows/projects/:project_id/templates). */
export interface ApplyTemplateInput {
  template_type: string;
  template_slug: string;
  preview?: boolean;
  placeholder_overrides?: Record<string, string>;
}

/** One created entity from apply result. */
export interface ApplyTemplateCreatedEntity {
  entity_type: string;
  entity_id: string;
  path: string;
}

/** Apply template result (and preview: same shape with preview: true). */
export interface ApplyTemplateResult {
  success: true;
  created_entities: ApplyTemplateCreatedEntity[];
  validation_errors?: Array<{ field: string; message: string; code?: string }>;
  /** Present when request had preview: true (dry-run). */
  preview?: true;
}
