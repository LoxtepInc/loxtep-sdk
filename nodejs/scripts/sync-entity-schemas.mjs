#!/usr/bin/env node
/**
 * Copy entity JSON schemas from a loxtep monorepo checkout into this package and pin
 * the exact source commit in schemas/entity-json-schemas/SOURCE.json.
 *
 * Usage:
 *   node scripts/sync-entity-schemas.mjs [/path/to/loxtep]
 *
 * Default source: ../../loxtep relative to this repo (sibling checkout).
 *
 * The source is the single platform copy (LoxtepInc/loxtep#3002):
 *   platform-backend/_core/src/workspace/entity-json-schemas/
 * Files are read from the checkout's HEAD commit (git), not the working tree, so the
 * pin in SOURCE.json always names exactly what was copied. The script refuses when the
 * source directory has uncommitted changes. `pnpm run check:entity-schemas` verifies
 * the vendored copy against the pin.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SOURCE_PATH, SCHEMA_SOURCE_REPOSITORY, gitBlobSha } from './entity-schema-source.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const destDir = join(packageRoot, 'schemas', 'entity-json-schemas');

const loxtepRoot = resolve(process.argv[2] ?? join(packageRoot, '..', '..', 'loxtep'));

function git(args, opts = {}) {
  return execFileSync('git', ['-C', loxtepRoot, ...args], { encoding: 'utf8', ...opts });
}

if (!existsSync(join(loxtepRoot, SCHEMA_SOURCE_PATH))) {
  console.error(`Source schemas not found: ${join(loxtepRoot, SCHEMA_SOURCE_PATH)}`);
  console.error('Pass the loxtep repo root: node scripts/sync-entity-schemas.mjs /path/to/loxtep');
  process.exit(1);
}

const dirty = git(['status', '--porcelain', '--', SCHEMA_SOURCE_PATH]).trim();
if (dirty) {
  console.error(`Refusing to sync: ${SCHEMA_SOURCE_PATH} has uncommitted changes:\n${dirty}`);
  process.exit(1);
}

const commit = git(['rev-parse', 'HEAD']).trim();
const tree = git(['ls-tree', commit, `${SCHEMA_SOURCE_PATH}/`])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map(line => {
    const [meta, path] = line.split('\t');
    const [, type, sha] = meta.split(' ');
    return { type, sha, name: path.slice(SCHEMA_SOURCE_PATH.length + 1) };
  })
  .filter(entry => entry.type === 'blob' && entry.name.endsWith('.json'));

if (tree.length === 0) {
  console.error(`No *.json under ${SCHEMA_SOURCE_PATH} at ${commit}`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
// Remove vendored schemas that no longer exist at the source.
const sourceNames = new Set(tree.map(entry => entry.name));
for (const name of readdirSync(destDir)) {
  if (name.endsWith('.json') && name !== 'SOURCE.json' && !sourceNames.has(name)) {
    rmSync(join(destDir, name));
  }
}

const files = {};
for (const entry of tree) {
  const content = execFileSync('git', ['-C', loxtepRoot, 'cat-file', 'blob', entry.sha]);
  if (gitBlobSha(content) !== entry.sha) {
    throw new Error(`Blob hash mismatch for ${entry.name}`);
  }
  writeFileSync(join(destDir, entry.name), content);
  files[entry.name] = entry.sha;
}

const source = {
  repository: SCHEMA_SOURCE_REPOSITORY,
  path: SCHEMA_SOURCE_PATH,
  commit,
  files,
};
writeFileSync(join(destDir, 'SOURCE.json'), `${JSON.stringify(source, null, 2)}\n`);

const syncNote = `# Entity JSON schemas (vendored)

These JSON Schema draft-07 files are byte-identical copies of the Loxtep platform's
single entity-schema source, used by \`loxtep lint\` and \`validateEntity()\`.

**Source:** \`${SCHEMA_SOURCE_REPOSITORY}\` \`${SCHEMA_SOURCE_PATH}/\`
**Pinned commit:** \`${commit}\` (git blob ids per file in \`SOURCE.json\`)

**Sync** (from \`nodejs/\`, with a loxtep checkout at the commit to pin):

\`\`\`bash
pnpm run sync:entity-schemas /path/to/loxtep
pnpm run check:entity-schemas
\`\`\`

\`check:entity-schemas\` runs in CI and before publish. It fails if any vendored file
differs from the pinned commit's blob, or if a file is missing or extra. Do not edit
these files by hand; re-sync instead and note the commit in CHANGELOG.md.
`;
writeFileSync(join(destDir, 'SCHEMA_SYNC.md'), syncNote);
console.log(`Synced ${tree.length} schema files from ${commit} → ${destDir}`);
