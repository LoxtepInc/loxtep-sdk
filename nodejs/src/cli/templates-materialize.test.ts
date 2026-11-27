/**
 * Package-root helper discovery under npm `.bin` shims (#88).
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { rootHelperCandidates } from './templates-materialize.js';

describe('rootHelperCandidates (npm bin shim)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'loxtep-bin-shim-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('resolves resolve-package-root.cjs via realpath of a .bin symlink', () => {
    const pkgRoot = join(tmpRoot, 'node_modules', '@loxtep', 'sdk');
    const cliDir = join(pkgRoot, 'dist', 'cli');
    const binDir = join(tmpRoot, 'node_modules', '.bin');
    mkdirSync(cliDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    const realEntry = join(cliDir, 'index.js');
    const helper = join(cliDir, 'resolve-package-root.cjs');
    writeFileSync(realEntry, '#!/usr/bin/env node\nexport {};\n', 'utf-8');
    writeFileSync(helper, 'module.exports = {};\n', 'utf-8');

    const shim = join(binDir, 'loxtep');
    symlinkSync(realEntry, shim);

    const emptyCwd = join(tmpRoot, 'empty-project');
    mkdirSync(emptyCwd);

    const candidates = rootHelperCandidates({
      // Simulate ESM publish: no __filename, argv is the .bin shim, cwd is empty
      filename: undefined,
      argv1: shim,
      cwd: emptyCwd,
      moduleDir: undefined,
    });

    const realHelper = join(dirname(realpathSync(shim)), 'resolve-package-root.cjs');
    expect(candidates).toContain(realHelper);
    expect(candidates).toContain(helper);
  });

  it('prefers esm moduleDir beside the helper (import.meta.url path)', () => {
    const cliDir = join(tmpRoot, 'dist', 'cli');
    mkdirSync(cliDir, { recursive: true });
    const helper = join(cliDir, 'resolve-package-root.cjs');
    writeFileSync(helper, 'module.exports = {};\n', 'utf-8');

    const candidates = rootHelperCandidates({
      moduleDir: cliDir,
      filename: undefined,
      argv1: join(tmpRoot, 'node_modules', '.bin', 'missing-shim'),
      cwd: join(tmpRoot, 'elsewhere'),
    });

    expect(candidates[0]).toBe(helper);
  });
});
