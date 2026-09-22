/**
 * CJS helper — resolves the @loxtep/sdk package root (directory containing
 * templates/ + package.json). Avoids `import.meta` so Jest/ts-jest can load
 * callers that need the template path.
 *
 * Published layout: <packageRoot>/dist/cli/*.js → walk up to packageRoot
 * Source layout:    <packageRoot>/src/cli/*.ts  → walk up to packageRoot
 */
'use strict';

const { existsSync, readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

function isSdkRoot(dir) {
  const pkgPath = join(dir, 'package.json');
  const templates = join(dir, 'templates');
  if (!existsSync(pkgPath) || !existsSync(templates)) return false;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')).name === '@loxtep/sdk';
  } catch {
    return false;
  }
}

function resolveFrom(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (isSdkRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveSdkPackageRoot() {
  if (process.env.LOXTEP_SDK_PACKAGE_ROOT && isSdkRoot(process.env.LOXTEP_SDK_PACKAGE_ROOT)) {
    return process.env.LOXTEP_SDK_PACKAGE_ROOT;
  }
  const fromModule = resolveFrom(__dirname);
  if (fromModule) return fromModule;
  const fromCwd = resolveFrom(process.cwd());
  if (fromCwd) return fromCwd;
  throw new Error(
    'Could not resolve @loxtep/sdk package root (expected package.json + templates/).'
  );
}

module.exports = { resolveSdkPackageRoot, isSdkRoot };
