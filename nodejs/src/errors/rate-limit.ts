import { LoxtepError } from './base.js';

/** 429 - Too many requests. */
export class RateLimitError extends LoxtepError {
  readonly retry_after_seconds: number;
  readonly limit: number;
  readonly remaining: number;
  readonly reset_at: string;

  constructor(
    message: string,
    options: {
      retry_after_seconds: number;
      limit: number;
      remaining: number;
      reset_at: string;
      details?: Record<string, unknown>;
      request_id?: string;
    }
  ) {
    super(message, {
      code: 'RATE_LIMIT_EXCEEDED',
      status_code: 429,
      details: options.details,
      request_id: options.request_id,
    });
    this.name = 'RateLimitError';
    this.retry_after_seconds = options.retry_after_seconds;
    this.limit = options.limit;
    this.remaining = options.remaining;
    this.reset_at = options.reset_at;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
