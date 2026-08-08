/**
 * Scrub platform/driver error text before it reaches CLI users or SDK callers.
 * Keeps actionable constraint / business-logic text; drops raw SQL and column lists.
 */

/** Knex/node-pg often prefixes: `insert into "t" (...) values (...) - <pg msg>`. */
const SQL_STATEMENT_PREFIX =
  /\b(?:insert\s+into|update|delete\s+from)\s+"[^"]+"\s*\((?:[^()]|\([^()]*\))*\)\s*(?:values\s*\((?:[^()]|\([^()]*\))*\)\s*)?(?:-\s*)?/gi;

const KNOWN_UNIQUE_CONSTRAINTS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  {
    pattern:
      /duplicate key value violates unique constraint "data_products_project_name_unique"/gi,
    replacement: 'a data product with this name already exists in the project',
  },
  {
    pattern: /duplicate key value violates unique constraint "workflows_project_name_unique"/gi,
    replacement: 'a workflow with this name already exists in the project',
  },
];

/** Generic unique-constraint leftover (constraint name only — no SQL). */
const GENERIC_UNIQUE_CONSTRAINT =
  /duplicate key value violates unique constraint "([^"]+)"/gi;

/**
 * Strip raw SQL / table schemas from platform error strings while keeping
 * actionable constraint text (and rewriting a few well-known ones).
 */
export function sanitizePlatformErrorMessage(message: string): string {
  let cleaned = message.replace(SQL_STATEMENT_PREFIX, '');

  for (const { pattern, replacement } of KNOWN_UNIQUE_CONSTRAINTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  cleaned = cleaned.replace(
    GENERIC_UNIQUE_CONSTRAINT,
    'duplicate value violates unique constraint "$1"'
  );

  return cleaned.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}

/** Sanitize common string fields on an error details object (in place copy). */
export function sanitizeErrorDetails(
  details: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const out: Record<string, unknown> = { ...details };
  for (const key of ['error', 'message'] as const) {
    const value = out[key];
    if (typeof value === 'string' && value.length > 0) {
      out[key] = sanitizePlatformErrorMessage(value);
    }
  }
  return out;
}
