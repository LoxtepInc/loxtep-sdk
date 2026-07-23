import { LoxtepError } from './base.js';
import { AuthenticationError } from './auth.js';
import { AuthorizationError } from './auth.js';
import { NotFoundError, ConflictError } from './resource.js';
import { ValidationError } from './validation.js';
import { RateLimitError } from './rate-limit.js';
import type { ApiErrorBody, RateLimitErrorBody } from './types.js';

/**
 * Map HTTP status code and response body to the appropriate Loxtep error class.
 * Used by the HTTP client (LOX-951) to throw typed errors on 4xx/5xx.
 *
 * @param status_code - HTTP status (e.g. 401, 403, 404, 429)
 * @param body - Parsed JSON body (message, code, details, etc.)
 * @param request_id - Optional request ID from headers
 * @returns Instance of the corresponding error class
 */
function extractPlatformErrorMessage(body: Record<string, unknown>): string | undefined {
  if (typeof body.message === 'string' && body.message.length > 0) {
    return body.message;
  }
  const nested = body.error;
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.message === 'string' && nestedRecord.message.length > 0) {
      return nestedRecord.message;
    }
  }
  return undefined;
}

function extractPlatformErrorDetails(
  body: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (body.details && typeof body.details === 'object') {
    return body.details as Record<string, unknown>;
  }
  const nested = body.error;
  if (nested && typeof nested === 'object') {
    const nestedDetails = (nested as Record<string, unknown>).details;
    if (nestedDetails && typeof nestedDetails === 'object') {
      return nestedDetails as Record<string, unknown>;
    }
  }
  return undefined;
}

export function parseHttpError(
  status_code: number,
  body: ApiErrorBody | RateLimitErrorBody | unknown,
  request_id?: string
): LoxtepError {
  const safe = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = extractPlatformErrorMessage(safe) ?? `HTTP ${status_code}`;
  const details = extractPlatformErrorDetails(safe);
  const reqId = typeof safe.request_id === 'string' ? safe.request_id : request_id;

  switch (status_code) {
    case 401:
      return new AuthenticationError(message, details);
    case 403:
      return new AuthorizationError(message, details);
    case 404: {
      const resource_type =
        typeof safe.resource_type === 'string' ? safe.resource_type : 'resource';
      const resource_id = typeof safe.resource_id === 'string' ? safe.resource_id : '';
      return new NotFoundError(message, resource_type, resource_id, { details, request_id: reqId });
    }
    case 409:
      return new ConflictError(message, { details, request_id: reqId });
    case 429: {
      const rl = body as RateLimitErrorBody;
      const retry_after_seconds =
        typeof rl?.retry_after_seconds === 'number' ? rl.retry_after_seconds : 60;
      const limit = typeof rl?.limit === 'number' ? rl.limit : 0;
      const remaining = typeof rl?.remaining === 'number' ? rl.remaining : 0;
      const reset_at =
        typeof rl?.reset_at === 'string'
          ? rl.reset_at
          : new Date(Date.now() + retry_after_seconds * 1000).toISOString();
      return new RateLimitError(message, {
        retry_after_seconds,
        limit,
        remaining,
        reset_at,
        details,
        request_id: reqId,
      });
    }
    case 400: {
      const field_errors = Array.isArray(safe.field_errors)
        ? (safe.field_errors as Array<{ field: string; message: string }>).filter(
            e => typeof e?.field === 'string' && typeof e?.message === 'string'
          )
        : [];
      return new ValidationError(message, field_errors, { details, request_id: reqId });
    }
    default: {
      return new LoxtepError(message, {
        code: (safe.code as string) ?? 'UNKNOWN_ERROR',
        status_code,
        details,
        request_id: reqId,
      });
    }
  }
}
