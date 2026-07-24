/**
 * CLI: loxtep lint [--workflow <id>]
 * Offline entity-schema + relationship lint of the local project package.
 */

import {
  hasLocalEntityPackage,
  lintLocalPackage,
  type LintResult,
} from '../../lib/workspace-lint.js';
import { findProjectDir } from '../project-context.js';

export interface LintCmdOptions {
  cwd?: string;
  workflow_id?: string;
}

export function formatLintResult(result: LintResult): string[] {
  const lines: string[] = [];
  if (result.ok) {
    lines.push(`Lint passed (${result.files_checked} file(s) checked).`);
    return lines;
  }
  lines.push(`Lint failed (${result.issues.length} issue(s), ${result.files_checked} file(s) checked):`);
  for (const issue of result.issues) {
    lines.push(`  ${issue.path}: ${issue.message}`);
  }
  return lines;
}

/**
 * Run lint and return structured result (for deploy preflight / tests).
 * When no local entity package exists, returns ok (deploy TS-module path still applies).
 */
export function runLintCheck(options: LintCmdOptions = {}): LintResult {
  const cwd = options.cwd ?? process.cwd();
  const projectDir = findProjectDir(cwd) ?? cwd;

  if (!hasLocalEntityPackage(projectDir) && !options.workflow_id) {
    return {
      ok: true,
      files_checked: 0,
      issues: [],
    };
  }

  return lintLocalPackage({
    projectDir,
    workflow_id: options.workflow_id,
  });
}

export async function runLint(options: LintCmdOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const projectDir = findProjectDir(cwd) ?? cwd;

  if (!hasLocalEntityPackage(projectDir) && !options.workflow_id) {
    console.error('No local entity package found (workflows/*/workflow.json or connectors/).');
    console.error('Run `loxtep ingest provision` first, or pass --workflow <id>.');
    process.exitCode = 1;
    return;
  }

  const result = lintLocalPackage({
    projectDir,
    workflow_id: options.workflow_id,
  });

  for (const line of formatLintResult(result)) {
    if (result.ok) console.log(line);
    else console.error(line);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}
