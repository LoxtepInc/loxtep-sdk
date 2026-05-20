import { LoxtepError } from './base.js';
import type { FieldError, DefinitionValidationErrorEntry } from './types.js';

/** 400 - Invalid input. */
export class ValidationError extends LoxtepError {
  readonly field_errors: FieldError[];

  constructor(
    message: string,
    field_errors: FieldError[] = [],
    options?: { details?: Record<string, unknown>; request_id?: string }
  ) {
    super(message, {
      code: 'VALIDATION_ERROR',
      status_code: 400,
      details: options?.details,
      request_id: options?.request_id,
    });
    this.name = 'ValidationError';
    this.field_errors = field_errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Payload doesn't match data product definition (backend: schema).
 * Alias: DefinitionValidationError per frontend terminology (schema → definition).
 */
export class DefinitionValidationError extends LoxtepError {
  readonly definition_version: string;
  readonly validation_errors: DefinitionValidationErrorEntry[];

  constructor(
    message: string,
    definition_version: string,
    validation_errors: DefinitionValidationErrorEntry[],
    options?: { details?: Record<string, unknown>; request_id?: string }
  ) {
    super(message, {
      code: 'DEFINITION_VALIDATION_ERROR',
      status_code: 400,
      details: options?.details,
      request_id: options?.request_id,
    });
    this.name = 'DefinitionValidationError';
    this.definition_version = definition_version;
    this.validation_errors = validation_errors;
    Object.setPrototypeOf(this, DefinitionValidationError.prototype);
  }
}
