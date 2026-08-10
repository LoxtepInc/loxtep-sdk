import { LoxtepError } from './base.js';

/** Canonical hint when the CLI/SDK session cannot be renewed. */
export const RELOGIN_HINT = 'Run: loxtep login';

/**
 * True when the platform/API Gateway is rejecting an expired AWS STS session
 * (SigV4), not an RBAC permission denial.
 */
export function isExpiredSecurityTokenMessage(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('security token included in the request is expired') ||
    m.includes('expiredtoken') ||
    m.includes('expired token')
  );
}

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

/** Build a clear "session dead, re-login" error for CLI/SDK callers. */
export function sessionExpiredError(
  reason?: string,
  details?: Record<string, unknown>
): AuthenticationError {
  const base =
    reason && reason.trim().length > 0
      ? reason.trim().replace(/\.*$/, '')
      : 'Session expired or revoked';
  return new AuthenticationError(`${base}. ${RELOGIN_HINT}`, details);
}
