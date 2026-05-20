import { LoxtepError } from './base.js';

/** 404 - Resource doesn't exist. */
export class NotFoundError extends LoxtepError {
  readonly resource_type: string;
  readonly resource_id: string;

  constructor(
    message: string,
    resource_type: string,
    resource_id: string,
    options?: { details?: Record<string, unknown>; request_id?: string }
  ) {
    super(message, {
      code: 'NOT_FOUND',
      status_code: 404,
      details: options?.details,
      request_id: options?.request_id,
    });
    this.name = 'NotFoundError';
    this.resource_type = resource_type;
    this.resource_id = resource_id;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/** 409 - Resource already exists or version conflict. */
export class ConflictError extends LoxtepError {
  constructor(
    message: string,
    options?: { details?: Record<string, unknown>; request_id?: string }
  ) {
    super(message, {
      code: 'CONFLICT',
      status_code: 409,
      details: options?.details,
      request_id: options?.request_id,
    });
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}
