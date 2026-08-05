#!/usr/bin/env node
/**
 * Copy entity JSON schemas from a loxtep monorepo checkout into this package.
 *
 * Usage:
 *   node scripts/sync-entity-schemas.mjs [/path/to/loxtep]
 *
 * Default source: ../../loxtep relative to this repo (sibling checkout).
 */

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const destDir = join(packageRoot, 'schemas', 'entity-json-schemas');

const loxtepRoot = resolve(
  process.argv[2] ?? join(packageRoot, '..', '..', 'loxtep')
);
const sourceDir = join(
  loxtepRoot,
  'platform-backend/_core/src/customer-workspace/entity-json-schemas'
);

if (!existsSync(sourceDir)) {
  console.error(`Source schemas not found: ${sourceDir}`);
  console.error('Pass the loxtep repo root: node scripts/sync-entity-schemas.mjs /path/to/loxtep');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

const files = readdirSync(sourceDir).filter(f => f.endsWith('.json'));
for (const file of files) {
  cpSync(join(sourceDir, file), join(destDir, file));
}

const syncNote = `# Entity JSON schemas (vendored)

These JSON Schema draft-07 files are a copy of the Loxtep platform schemas used
for customer workspace entity validation.

**Source (canonical):** Loxtep platform customer-workspace entity JSON schemas
(private platform monorepo). Sync from a local checkout when those schemas
change.

**Sync command** (from \`nodejs/\`):

\`\`\`bash
node scripts/sync-entity-schemas.mjs /path/to/loxtep
\`\`\`

When platform schemas change, re-run the sync script and note the date/source
commit in the SDK CHANGELOG.

**Last synced:** ${new Date().toISOString().slice(0, 10)} (from local Loxtep platform checkout)
`;

writeFileSync(join(destDir, 'SCHEMA_SYNC.md'), syncNote);
console.log(`Synced ${files.length} schema files → ${destDir}`);
