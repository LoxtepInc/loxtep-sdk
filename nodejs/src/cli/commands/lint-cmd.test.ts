/**
 * Unit tests for `loxtep lint` helpers.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { formatLintResult, runLint, runLintCheck } from './lint-cmd.js';
import type { LintResult } from '../../lib/workspace-lint.js';

describe('formatLintResult', () => {
  it('formats ok results', () => {
    const result: LintResult = { ok: true, files_checked: 3, issues: [] };
    expect(formatLintResult(result)).toEqual(['Lint passed (3 file(s) checked).']);
  });

  it('formats fail results with issue paths', () => {
    const result: LintResult = {
      ok: false,
      files_checked: 2,
      issues: [
        { path: 'workflows/wf/workflow.json', severity: 'error', message: 'missing name' },
      ],
    };
    const lines = formatLintResult(result);
    expect(lines[0]).toContain('Lint failed (1 issue(s)');
    expect(lines[1]).toContain('workflows/wf/workflow.json: missing name');
  });
});

describe('runLintCheck / runLint', () => {
  let tmpDir: string;

  beforeEach(() => {
    process.exitCode = 0;
    tmpDir = mkdtempSync(join(tmpdir(), 'loxtep-lint-cmd-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = 0;
  });

  it('runLintCheck returns ok when no local entity package', () => {
    const result = runLintCheck({ cwd: tmpDir });
    expect(result).toEqual({ ok: true, files_checked: 0, issues: [] });
  });

  it('runLint exits 1 when no local entity package', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await runLint({ cwd: tmpDir });
    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join(' ')).toContain('No local entity package found');
    errSpy.mockRestore();
  });
});
