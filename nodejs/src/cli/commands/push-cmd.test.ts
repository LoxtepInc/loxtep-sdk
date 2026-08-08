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
          'Workflow bundle written to S3 but catalog index failed: ' +
          'a data product with this name already exists in the project',
      },
    });
    const formatted = formatPushError(err);
    expect(formatted).toContain('a data product with this name already exists');
    expect(formatted).toContain('Workflow bundle catalog index failed');
  });

  it('does not duplicate details already present in message', () => {
    const detail =
      'Workflow bundle written to S3 but catalog index failed: ' +
      'a data product with this name already exists in the project';
    const err = new LoxtepError(detail, {
      code: 'UNKNOWN_ERROR',
      status_code: 500,
      details: { error: detail },
    });
    expect(formatPushError(err)).toBe(detail);
  });

  it('strips SQL column lists from raw catalog errors', () => {
    const err = new LoxtepError('Workflow bundle catalog index failed', {
      code: 'UNKNOWN_ERROR',
      status_code: 500,
      details: {
        error:
          'Workflow bundle written to S3 but catalog index failed: insert into "data_products" ' +
          '("created_at", "name", "organization_id", "project_id") values ($1, $2, $3, $4) - ' +
          'duplicate key value violates unique constraint "data_products_project_name_unique". ' +
          'CLI list/get/get_writer will stay empty until catalog upsert succeeds.',
      },
    });
    const formatted = formatPushError(err);
    expect(formatted).toContain('a data product with this name already exists in the project');
    expect(formatted).toContain('CLI list/get/get_writer will stay empty');
    expect(formatted).not.toMatch(/insert into/i);
    expect(formatted).not.toContain('organization_id');
    expect(formatted).not.toContain('created_at');
  });
});
