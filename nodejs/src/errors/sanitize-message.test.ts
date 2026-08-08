import { sanitizeErrorDetails, sanitizePlatformErrorMessage } from './sanitize-message.js';

describe('sanitizePlatformErrorMessage', () => {
  it('strips Knex insert + column list and rewrites data_products unique constraint', () => {
    const raw =
      'Workflow bundle written to S3 but catalog index failed: insert into "data_products" ' +
      '("created_at", "data_product_id", "delivery", "description", "domain_id", "governance", ' +
      '"ingestion", "is_active", "kind", "lineage", "metadata", "name", "organization_id", "owner", ' +
      '"project_id", "quality", "schema", "status", "storage", "updated_at", "workflow_id") ' +
      'values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) - ' +
      'duplicate key value violates unique constraint "data_products_project_name_unique". ' +
      'CLI list/get/get_writer will stay empty until catalog upsert succeeds.';

    const cleaned = sanitizePlatformErrorMessage(raw);

    expect(cleaned).toBe(
      'Workflow bundle written to S3 but catalog index failed: ' +
        'a data product with this name already exists in the project. ' +
        'CLI list/get/get_writer will stay empty until catalog upsert succeeds.'
    );
    expect(cleaned).not.toMatch(/insert into/i);
    expect(cleaned).not.toContain('created_at');
    expect(cleaned).not.toContain('organization_id');
  });

  it('rewrites workflows unique constraint', () => {
    const cleaned = sanitizePlatformErrorMessage(
      'duplicate key value violates unique constraint "workflows_project_name_unique"'
    );
    expect(cleaned).toBe('a workflow with this name already exists in the project');
  });

  it('keeps unknown unique constraint names without SQL', () => {
    const cleaned = sanitizePlatformErrorMessage(
      'insert into "widgets" ("id") values ($1) - duplicate key value violates unique constraint "widgets_slug_unique"'
    );
    expect(cleaned).toBe('duplicate value violates unique constraint "widgets_slug_unique"');
    expect(cleaned).not.toMatch(/insert into/i);
  });

  it('leaves non-SQL messages alone', () => {
    expect(sanitizePlatformErrorMessage('Missing project_id')).toBe('Missing project_id');
  });
});

describe('sanitizeErrorDetails', () => {
  it('sanitizes error and message string fields', () => {
    const details = sanitizeErrorDetails({
      error:
        'insert into "data_products" ("name") values ($1) - duplicate key value violates unique constraint "data_products_project_name_unique"',
      code: 'KEEP_ME',
    });
    expect(details?.error).toBe('a data product with this name already exists in the project');
    expect(details?.code).toBe('KEEP_ME');
  });
});
