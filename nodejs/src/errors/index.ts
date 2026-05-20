/**
 * Loxtep SDK error hierarchy and HTTP→error mapping.
 * All API-facing properties use snake_case per backend conventions.
 */

export { LoxtepError } from './base.js';
export { AuthenticationError, AuthorizationError } from './auth.js';
export { NotFoundError, ConflictError } from './resource.js';
export { ValidationError, DefinitionValidationError } from './validation.js';
/** Alias for DefinitionValidationError (backend: schema → customer term: definition). */
export { DefinitionValidationError as SchemaValidationError } from './validation.js';
export { RateLimitError } from './rate-limit.js';
export { StreamingError, CheckpointError } from './streaming.js';
export { parseHttpError } from './parse-http.js';

export type {
  LoxtepErrorOptions,
  FieldError,
  DefinitionValidationErrorEntry,
  RateLimitErrorBody,
  ApiErrorBody,
} from './types.js';
