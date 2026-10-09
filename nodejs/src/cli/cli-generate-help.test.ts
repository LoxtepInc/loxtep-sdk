/**
 * `loxtep generate --help` prints usage and does not write the generated client.
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index.js';

describe('generate --help', () => {
  const originalCwd = process.cwd();
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'loxtep-generate-help-'));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it('does not write .loxtep/generated/index.ts', async () => {
    await runCli(['generate', '--help']);
    expect(existsSync(join(root, '.loxtep', 'generated', 'index.ts'))).toBe(false);
  });
});
