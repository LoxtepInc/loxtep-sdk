import type { LoxtepErrorOptions } from './types.js';

/** Error codes that are considered retryable (e.g. 429, 503). */
const RETRYABLE_CODES = new Set([
  'RATE_LIMIT_EXCEEDED',
  'RATE_LIMIT_ERROR',
  'SERVICE_UNAVAILABLE',
  'GATEWAY_TIMEOUT',
  'INTERNAL_SERVER_ERROR',
]);

/**
 * Base error class for all Loxtep SDK errors.
 * All API-facing properties use snake_case per backend conventions.
 */
export class LoxtepError extends Error {
  readonly code: string;
  readonly status_code?: number;
  readonly details?: Record<string, unknown>;
  readonly request_id?: string;

  constructor(message: string, options: LoxtepErrorOptions) {
    super(message);
    this.name = 'LoxtepError';
    this.code = options.code;
    this.status_code = options.status_code;
    this.details = options.details;
    this.request_id = options.request_id;
    Object.setPrototypeOf(this, LoxtepError.prototype);
  }

  /** Whether this error is retryable (e.g. rate limit, transient server error). */
  get is_retryable(): boolean {
    return RETRYABLE_CODES.has(this.code);
  }
}
