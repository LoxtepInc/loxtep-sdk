import { LoxtepError } from './base.js';

/** 401 - Token expired, invalid credentials. */
export class AuthenticationError extends LoxtepError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'AUTHENTICATION_ERROR',
      status_code: 401,
      details,
    });
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/** 403 - Insufficient permissions. */
export class AuthorizationError extends LoxtepError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'AUTHORIZATION_ERROR',
      status_code: 403,
      details,
    });
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}
