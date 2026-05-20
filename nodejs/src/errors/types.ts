/**
 * Options for LoxtepError base class.
 * All API-facing fields use snake_case per backend conventions.
 */
export interface LoxtepErrorOptions {
  code: string;
  status_code?: number;
  details?: Record<string, unknown>;
  request_id?: string;
}

/**
 * Field error for ValidationError.
 */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * Validation error entry for DefinitionValidationError.
 */
export interface DefinitionValidationErrorEntry {
  path: string;
  message: string;
}

/**
 * Parsed body from 429 response for RateLimitError.
 */
export interface RateLimitErrorBody {
  retry_after_seconds?: number;
  limit?: number;
  remaining?: number;
  reset_at?: string;
  message?: string;
}

/**
 * Generic API error response body (4xx/5xx).
 */
export interface ApiErrorBody {
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
  request_id?: string;
}
