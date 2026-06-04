/**
 * Stage 4: Write — atomic file overwrite returning per-type counts.
 *
 * This I/O stage takes the emitted TypeScript source string and writes it
 * atomically to the target path. "Atomic" means: write to a temporary file
 * in the same directory, then rename over the target. If the process crashes
 * or the write fails at any point, the prior artifact remains unchanged (R2.8).
 *
 * The function also computes and returns per-resource-type counts from the
 * provided NormalizedContext so the CLI can print them (R2.7).
 *
 * Requirements: R2.6, R2.7, R2.8
 *
 * @module codegen/write-artifact
 */

import { writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { NormalizedContext, GenerateCounts } from './types.js';

/**
 * Computes per-resource-type counts from a NormalizedContext.
 * Returns 0 for each resource type that has no resources (R2.7).
 */
export function computeCounts(norm: NormalizedContext): GenerateCounts {
  return {
    dataProducts: norm.dataProducts.length,
    connectors: norm.connectors.length,
    domains: norm.domains.length,
    queues: norm.queues.length,
    flows: norm.flows.length,
    workflows: norm.workflows.length,
  };
}

/**
 * Writes the generated artifact source to disk atomically and returns per-type counts.
 *
 * Atomicity strategy:
 * 1. Ensure the target directory exists.
 * 2. Write the full source to a temporary file in the same directory (same filesystem).
 * 3. Rename the temporary file over the target path (atomic on POSIX filesystems).
 *
 * If any step fails, the temporary file is cleaned up (best-effort) and the
 * prior artifact at `targetPath` remains unchanged (R2.8). The error is re-thrown
 * so the caller can handle it (e.g. exit non-zero, print the failure reason).
 *
 * @param targetPath - Absolute or relative path to the generated artifact file.
 * @param source - The TypeScript source string produced by `emitArtifact`.
 * @param norm - The NormalizedContext used to compute resource counts.
 * @returns Per-resource-type counts written to the artifact (R2.7).
 */
export async function writeArtifact(
  targetPath: string,
  source: string,
  norm: NormalizedContext,
): Promise<GenerateCounts> {
  const dir = dirname(targetPath);
  const tempName = `.loxtep-gen-${randomBytes(8).toString('hex')}.tmp`;
  const tempPath = join(dir, tempName);

  try {
    // Ensure target directory exists
    await mkdir(dir, { recursive: true });

    // Write full content to temp file (same directory → same filesystem for rename)
    await writeFile(tempPath, source, 'utf-8');

    // Atomic rename over the target (R2.8: prior artifact unchanged on failure above)
    await rename(tempPath, targetPath);
  } catch (err: unknown) {
    // Best-effort cleanup of the temp file
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors — the temp file may not have been created
    }
    throw err;
  }

  return computeCounts(norm);
}
