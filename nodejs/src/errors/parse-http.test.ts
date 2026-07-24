import { parseHttpError } from './parse-http.js';
import { AuthenticationError } from './auth.js';
import { AuthorizationError } from './auth.js';
import { NotFoundError } from './resource.js';
import { RateLimitError } from './rate-limit.js';
import { ValidationError } from './validation.js';
import { LoxtepError } from './base.js';

describe('parseHttpError', () => {
  it('should map 401 to AuthenticationError', () => {
    const err = parseHttpError(401, { message: 'Invalid token' });
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.message).toBe('Invalid token');
    expect(err.status_code).toBe(401);
  });

  it('should map 403 to AuthorizationError', () => {
    const err = parseHttpError(403, { message: 'Forbidden' });
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err.status_code).toBe(403);
  });

  it('should map 404 to NotFoundError with resource_type and resource_id', () => {
    const err = parseHttpError(404, {
      message: 'Not found',
      resource_type: 'data_product',
      resource_id: 'asset-123',
    });
    expect(err).toBeInstanceOf(NotFoundError);
    const notFound = err as NotFoundError;
    expect(notFound.resource_type).toBe('data_product');
    expect(notFound.resource_id).toBe('asset-123');
  });

  it('should read message from Loxtep platform error envelope', () => {
    const err = parseHttpError(404, {
      success: false,
      error: {
        message: 'Unable to resolve stream configuration for this instance',
        details: { instance_id: 'abc', hint: 'Instance may not be fully provisioned' },
      },
    });
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toBe('Unable to resolve stream configuration for this instance');
    expect(err.details?.instance_id).toBe('abc');
  });

  it('should map 429 to RateLimitError with retry_after_seconds, limit, remaining, reset_at', () => {
    const body = {
      message: 'Too many requests',
      retry_after_seconds: 30,
      limit: 100,
      remaining: 0,
      reset_at: '2026-01-29T12:00:00Z',
    };
    const err = parseHttpError(429, body);
    expect(err).toBeInstanceOf(RateLimitError);
    const rateLimit = err as RateLimitError;
    expect(rateLimit.retry_after_seconds).toBe(30);
    expect(rateLimit.limit).toBe(100);
    expect(rateLimit.remaining).toBe(0);
    expect(rateLimit.reset_at).toBe('2026-01-29T12:00:00Z');
  });

  it('should map 429 with minimal body to RateLimitError with defaults', () => {
    const err = parseHttpError(429, {});
    expect(err).toBeInstanceOf(RateLimitError);
    const rateLimit = err as RateLimitError;
    expect(rateLimit.retry_after_seconds).toBe(60);
    expect(rateLimit.limit).toBe(0);
    expect(rateLimit.remaining).toBe(0);
    expect(typeof rateLimit.reset_at).toBe('string');
  });

  it('should map 400 with field_errors to ValidationError', () => {
    const err = parseHttpError(400, {
      message: 'Validation failed',
      field_errors: [{ field: 'name', message: 'Required' }],
    });
    expect(err).toBeInstanceOf(ValidationError);
    const validation = err as ValidationError;
    expect(validation.field_errors).toEqual([{ field: 'name', message: 'Required' }]);
  });

  it('should prefer string details over generic Validation Error title', () => {
    const err = parseHttpError(400, {
      success: false,
      error: {
        message: 'Validation Error',
        details:
          'SDK connector requires metadata.instance_id when the organization has multiple instances.',
      },
    });
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toContain('metadata.instance_id');
    expect(err.details?.message).toContain('metadata.instance_id');
  });

  it('should map unknown status to LoxtepError', () => {
    const err = parseHttpError(503, { message: 'Service unavailable' });
    expect(err).toBeInstanceOf(LoxtepError);
    expect(err.status_code).toBe(503);
  });
});
