#!/usr/bin/env node
/**
 * Fail when the vendored entity schemas drift from the pinned loxtep commit.
 *
 * Offline (always, runs in CI): every *.json in schemas/entity-json-schemas/ must be
 * listed in SOURCE.json with the same git blob id, and every listed file must exist.
 * The blob ids are those of SOURCE.json.commit in LoxtepInc/loxtep, so a hand edit, a
 * partial sync, or a stale file fails here.
 *
 * With a loxtep checkout (`--source /path/to/loxtep`): also verifies SOURCE.json against
 * `git ls-tree <commit>` in that checkout, proving the pin itself is genuine.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SOURCE_PATH, SCHEMA_SOURCE_REPOSITORY, gitBlobSha } from './entity-schema-source.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(resolve(here, '..'), 'schemas', 'entity-json-schemas');
const problems = [];

const sourcePath = join(schemasDir, 'SOURCE.json');
if (!existsSync(sourcePath)) {
  console.error(`Missing ${sourcePath}; run pnpm run sync:entity-schemas /path/to/loxtep`);
  process.exit(1);
}
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
if (source.repository !== SCHEMA_SOURCE_REPOSITORY) {
  problems.push(`SOURCE.json repository is ${source.repository}, expected ${SCHEMA_SOURCE_REPOSITORY}`);
}
if (source.path !== SCHEMA_SOURCE_PATH) {
  problems.push(`SOURCE.json path is ${source.path}, expected ${SCHEMA_SOURCE_PATH}`);
}
if (!/^[0-9a-f]{40}$/.test(source.commit ?? '')) {
  problems.push(`SOURCE.json commit is not a full sha: ${source.commit}`);
}
const pinned = source.files ?? {};
if (Object.keys(pinned).length === 0) problems.push('SOURCE.json lists no files');

const vendored = readdirSync(schemasDir).filter(n => n.endsWith('.json') && n !== 'SOURCE.json');
for (const name of vendored) {
  if (!(name in pinned)) {
    problems.push(`${name} is vendored but not in SOURCE.json (not from the pinned commit)`);
    continue;
  }
  const actual = gitBlobSha(readFileSync(join(schemasDir, name)));
  if (actual !== pinned[name]) {
    problems.push(`${name} differs from ${source.commit}: blob ${actual}, pinned ${pinned[name]}`);
  }
}
for (const name of Object.keys(pinned)) {
  if (!vendored.includes(name)) problems.push(`${name} is pinned but missing from the package`);
}

const sourceFlag = process.argv.indexOf('--source');
if (sourceFlag !== -1) {
  const loxtepRoot = resolve(process.argv[sourceFlag + 1] ?? '');
  const listing = execFileSync(
    'git',
    ['-C', loxtepRoot, 'ls-tree', source.commit, `${SCHEMA_SOURCE_PATH}/`],
    { encoding: 'utf8' }
  );
  const upstream = {};
  for (const line of listing.trim().split('\n').filter(Boolean)) {
    const [meta, path] = line.split('\t');
    const [, type, sha] = meta.split(' ');
    const name = path.slice(SCHEMA_SOURCE_PATH.length + 1);
    if (type === 'blob' && name.endsWith('.json')) upstream[name] = sha;
  }
  const a = JSON.stringify(Object.entries(upstream).sort());
  const b = JSON.stringify(Object.entries(pinned).sort());
  if (a !== b) problems.push(`SOURCE.json files do not match ${source.commit} in ${loxtepRoot}`);
}

if (problems.length > 0) {
  console.error(`Entity schema drift against ${SCHEMA_SOURCE_REPOSITORY}@${source.commit}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `Entity schemas match ${SCHEMA_SOURCE_REPOSITORY}@${source.commit} (${vendored.length} files` +
    (sourceFlag !== -1 ? ', pin verified against source checkout' : '') +
    ')'
);
