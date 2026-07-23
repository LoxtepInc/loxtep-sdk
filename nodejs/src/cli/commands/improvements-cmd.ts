/**
 * CLI: loxtep improvements list|apply|reject
 *
 * - `list` — list improvements for the authenticated org (R8.3)
 * - `apply <id>` — write proposed_change into the module file atomically, set status to applied (R8.4, R8.7)
 * - `reject <id>` — set status to rejected (R8.5)
 * - Guard unknown-id/non-`proposed` with non-zero exit and no state change (R8.6)
 *
 * Requirements: 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { writeFile, rename, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import { toImprovementListSummary } from '../../client/list-summaries.js';
import {
  requireProject,
  preconditionToCliResult,
  type CliResult,
} from '../project-context.js';

/**
 * Execute `loxtep improvements list`.
 *
 * Lists improvements from the API and prints them in a readable format.
 * Requires authentication but does NOT require an attached project.
 */
export async function runImprovementsListCommand(
  client: LoxtepClient,
  options?: { status?: string; workflow_name?: string }
): Promise<CliResult> {
  try {
    const filters: { status?: 'proposed' | 'applied' | 'rejected'; workflow_name?: string } = {};
    if (options?.status) {
      if (!['proposed', 'applied', 'rejected'].includes(options.status)) {
        return {
          exitCode: 1,
          stdout: [],
          stderr: [`Invalid status filter: '${options.status}'. Must be one of: proposed, applied, rejected.`],
        };
      }
      filters.status = options.status as 'proposed' | 'applied' | 'rejected';
    }
    if (options?.workflow_name) {
      filters.workflow_name = options.workflow_name;
    }

    const result = await client.review.improvements.list(filters);
    const summary = result.improvements.map(toImprovementListSummary);
    return {
      exitCode: 0,
      stdout: [JSON.stringify(summary, null, 2)],
      stderr: [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to list improvements: ${message}`] };
  }
}

/**
 * Execute `loxtep improvements apply <id>`.
 *
 * 1. Fetches the improvement from the API (validates it exists and is `proposed`)
 * 2. Resolves the target workflow module file
 * 3. Writes the `proposed_change` into the file atomically (temp + rename)
 * 4. Calls the API to set status to `applied`
 * 5. On any file-write failure: file stays unchanged, status stays `proposed` (R8.7)
 *
 * Requirements: 8.4, 8.6, 8.7
 */
export async function runImprovementsApplyCommand(
  client: LoxtepClient,
  id: string,
  cwd?: string
): Promise<CliResult> {
  const workingDir = cwd ?? process.cwd();

  // Resolve the project directory (need it to locate workflow files)
  const projectResult = requireProject(workingDir);
  if (!projectResult.ok) {
    return preconditionToCliResult(projectResult.failure);
  }
  const { projectDir } = projectResult;

  // 1. Fetch the improvement from the list endpoint to get its details
  let improvement;
  try {
    const result = await client.review.improvements.list();
    improvement = result.improvements.find(imp => imp.id === id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to fetch improvement: ${message}`] };
  }

  if (!improvement) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Error: Improvement '${id}' not found.`],
    };
  }

  // R8.6: Guard non-proposed status
  if (improvement.status !== 'proposed') {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Error: Improvement '${id}' is in status '${improvement.status}', not 'proposed'. Only proposed improvements can be applied.`,
      ],
    };
  }

  // 2. Resolve the target workflow module file
  const workflowFile = resolveWorkflowFilePath(projectDir, improvement.workflow_name);
  if (!workflowFile) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Error: Cannot locate workflow module file for '${improvement.workflow_name}'. Write failed — status remains 'proposed'.`,
      ],
    };
  }

  // 3. Write the proposed_change atomically (R8.7: on failure, file unchanged + status stays proposed)
  try {
    await atomicWriteFile(workflowFile, improvement.proposed_change);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Error: Failed to write proposed change to '${workflowFile}': ${message}. File unchanged — status remains 'proposed'.`,
      ],
    };
  }

  // 4. Set status to 'applied' on the server
  try {
    await client.review.improvements.apply(id);
  } catch (err: unknown) {
    // File was already written successfully, but API update failed.
    // Per R8.4, the write happened; per R8.7 failure semantics are about write failure.
    // Since the file was written, report the API error but the file change stands.
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Warning: Proposed change was written to '${workflowFile}', but failed to update status on server: ${message}`,
      ],
    };
  }

  return {
    exitCode: 0,
    stdout: [`Applied improvement '${id}' — wrote proposed change to '${workflowFile}' and set status to 'applied'.`],
    stderr: [],
  };
}

/**
 * Execute `loxtep improvements reject <id>`.
 *
 * Sets the improvement status to `rejected` on the server.
 * Guards unknown-id and non-`proposed` status with non-zero exit (R8.6).
 *
 * Requirements: 8.5, 8.6
 */
export async function runImprovementsRejectCommand(
  client: LoxtepClient,
  id: string
): Promise<CliResult> {
  try {
    await client.review.improvements.reject(id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // The API returns 404 for unknown id and 409 for non-proposed status.
    // Both are surfaced as errors — no state change (R8.6).
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`Error: Failed to reject improvement '${id}': ${message}`],
    };
  }

  return {
    exitCode: 0,
    stdout: [`Rejected improvement '${id}' — status set to 'rejected'.`],
    stderr: [],
  };
}

/**
 * Resolve the file path for a workflow module by name.
 *
 * Searches for `workflows/<workflow_name>.ts` relative to the project directory.
 * Returns the full path if the file exists, or null if not found.
 */
function resolveWorkflowFilePath(projectDir: string, workflowName: string): string | null {
  // Primary: workflows/<name>.ts
  const primary = join(projectDir, 'workflows', `${workflowName}.ts`);
  if (existsSync(primary)) return primary;

  // Fallback: workflows/<name>/index.ts
  const indexPath = join(projectDir, 'workflows', workflowName, 'index.ts');
  if (existsSync(indexPath)) return indexPath;

  return null;
}

/**
 * Write content to a file atomically using a temp file + rename pattern.
 *
 * On any failure, the original file remains byte-unchanged (R8.7).
 */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  const tmpPath = join(
    dir,
    `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  try {
    await writeFile(tmpPath, content, 'utf-8');
    await rename(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup of temp file
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}
