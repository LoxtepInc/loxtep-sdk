import { LoxtepError } from '../../errors/base.js';
import { formatPushError } from './push-cmd.js';

describe('formatPushError', () => {
  it('returns Error.message for plain errors', () => {
    expect(formatPushError(new Error('boom'))).toBe('boom');
  });

  it('appends details.error when message is opaque', () => {
    const err = new LoxtepError('Workflow bundle catalog index failed', {
      code: 'UNKNOWN_ERROR',
      status_code: 500,
      details: {
        error:
          'Workflow bundle written to S3 but catalog index failed: data_products_project_name_unique',
      },
    });
    expect(formatPushError(err)).toContain('data_products_project_name_unique');
    expect(formatPushError(err)).toContain('Workflow bundle catalog index failed');
  });

  it('does not duplicate details already present in message', () => {
    const detail = 'Workflow bundle written to S3 but catalog index failed: duplicate key';
    const err = new LoxtepError(detail, {
      code: 'UNKNOWN_ERROR',
      status_code: 500,
      details: { error: detail },
    });
    expect(formatPushError(err)).toBe(detail);
  });
});
