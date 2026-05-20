import { LoxtepError } from './base.js';

describe('LoxtepError', () => {
  it('should set code, status_code, details, request_id', () => {
    const err = new LoxtepError('Something failed', {
      code: 'CUSTOM_CODE',
      status_code: 500,
      details: { key: 'value' },
      request_id: 'req-123',
    });
    expect(err.message).toBe('Something failed');
    expect(err.code).toBe('CUSTOM_CODE');
    expect(err.status_code).toBe(500);
    expect(err.details).toEqual({ key: 'value' });
    expect(err.request_id).toBe('req-123');
    expect(err.name).toBe('LoxtepError');
  });

  it('should report is_retryable true for RATE_LIMIT_EXCEEDED', () => {
    const err = new LoxtepError('Rate limited', {
      code: 'RATE_LIMIT_EXCEEDED',
      status_code: 429,
    });
    expect(err.is_retryable).toBe(true);
  });

  it('should report is_retryable false for NOT_FOUND', () => {
    const err = new LoxtepError('Not found', {
      code: 'NOT_FOUND',
      status_code: 404,
    });
    expect(err.is_retryable).toBe(false);
  });
});
