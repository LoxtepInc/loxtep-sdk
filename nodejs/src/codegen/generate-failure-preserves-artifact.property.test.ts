import fc from 'fast-check';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { writeArtifact } from './write-artifact.js';
import type { NormalizedContext } from './types.js';

/**
 * Feature: ai-first-platform-surface
 * Property 10: Generate failure preserves the prior artifact
 *
 * IF the CLI cannot retrieve the Workspace_Context from the platform while running
 * `loxtep generate`, THEN the CLI SHALL leave any previously generated
 * Generated_SDK_Artifact unchanged.
 *
 * This property verifies that when writeArtifact fails (due to the target path
 * being invalid — simulating a failure during the generate pipeline), the prior
 * artifact content on disk remains byte-identical to what it was before the
 * failed attempt.
 *
 * **Validates: Requirements 2.8**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary prior artifact content (any non-empty string representing a previously generated file). */
const priorArtifactArb = fc.string({ minLength: 1, maxLength: 500 })
  .map((s) => `// AUTO-GENERATED — do not edit\n${s}\n`);

/** Arbitrary new source that would be written on success. */
const newSourceArb = fc.string({ minLength: 1, maxLength: 500 })
  .map((s) => `// AUTO-GENERATED — updated\n${s}\n`);

/** Arbitrary NormalizedContext (contents don't matter — we're testing failure behavior). */
const normalizedContextArb: fc.Arbitrary<NormalizedContext> = fc.record({
  dataProducts: fc.array(
    fc.record({
      key: fc.stringMatching(/^[a-z_]{1,10}$/),
      data: fc.record({
        name: fc.stringMatching(/^[a-z_]{1,10}$/),
        id: fc.stringMatching(/^dp_[a-z0-9]{4,8}$/),
        domain: fc.constant(null),
        schema: fc.constant(null),
      }),
    }),
    { minLength: 0, maxLength: 3 },
  ),
  connectors: fc.array(
    fc.record({
      key: fc.stringMatching(/^[a-z_]{1,10}$/),
      data: fc.record({
        type: fc.stringMatching(/^[a-z]{3,8}$/),
        id: fc.stringMatching(/^cn_[a-z0-9]{4,8}$/),
        connection_id: fc.constant(null),
        name: fc.stringMatching(/^[a-z_]{1,10}$/),
      }),
    }),
    { minLength: 0, maxLength: 3 },
  ),
  domains: fc.array(
    fc.record({
      key: fc.stringMatching(/^[a-z_]{1,10}$/),
      data: fc.record({
        name: fc.stringMatching(/^[a-z_]{1,10}$/),
        id: fc.stringMatching(/^dm_[a-z0-9]{4,8}$/),
        data_product_ids: fc.constant([]),
      }),
    }),
    { minLength: 0, maxLength: 2 },
  ),
  queues: fc.array(
    fc.record({
      key: fc.stringMatching(/^[a-z_]{1,10}$/),
      data: fc.record({
        name: fc.stringMatching(/^[a-z_]{1,10}$/),
        id: fc.stringMatching(/^q_[a-z0-9]{4,8}$/),
      }),
    }),
    { minLength: 0, maxLength: 2 },
  ),
  flows: fc.array(
    fc.record({
      key: fc.stringMatching(/^[a-z_]{1,10}$/),
      data: fc.record({
        name: fc.stringMatching(/^[a-z_]{1,10}$/),
        id: fc.stringMatching(/^f_[a-z0-9]{4,8}$/),
      }),
    }),
    { minLength: 0, maxLength: 2 },
  ),
  workflows: fc.array(
    fc.record({
      key: fc.stringMatching(/^[a-z_]{1,10}$/),
      data: fc.record({
        name: fc.stringMatching(/^[a-z_]{1,10}$/),
        id: fc.stringMatching(/^wf_[a-z0-9]{4,8}$/),
      }),
    }),
    { minLength: 0, maxLength: 2 },
  ),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a unique temp directory for each test run. */
function tempDir(): string {
  return join(tmpdir(), `pbt-gen-failure-${randomBytes(8).toString('hex')}`);
}

// ─── Property Test ────────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 10: Generate failure preserves the prior artifact', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = tempDir();
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it(
    'when writeArtifact fails (target is a non-empty directory), the prior artifact content is preserved byte-identical',
    () => {
      return fc.assert(
        fc.asyncProperty(
          priorArtifactArb,
          newSourceArb,
          normalizedContextArb,
          async (priorContent, newSource, norm) => {
            // Setup: write a prior artifact to disk
            const artifactPath = join(testDir, 'index.ts');
            await writeFile(artifactPath, priorContent, 'utf-8');

            // Create a blocker directory at a separate path that will be used as
            // an invalid target to trigger a rename failure (EISDIR on Linux).
            const blockerDir = join(testDir, 'blocker');
            await mkdir(blockerDir, { recursive: true });
            await writeFile(join(blockerDir, 'file'), 'x', 'utf-8');

            // Attempt to write new content to the blocker directory path (will fail)
            await expect(
              writeArtifact(blockerDir, newSource, norm),
            ).rejects.toThrow();

            // The prior artifact at the original path must remain unchanged
            const afterContent = await readFile(artifactPath, 'utf-8');
            expect(afterContent).toBe(priorContent);
          },
        ),
        { numRuns: 100 },
      );
    },
    60_000,
  );

  it(
    'when writeArtifact fails (read-only temp file write), the function throws and no content is overwritten',
    () => {
      return fc.assert(
        fc.asyncProperty(
          priorArtifactArb,
          newSourceArb,
          normalizedContextArb,
          async (priorContent, newSource, norm) => {
            // Setup: write a prior artifact
            const artifactPath = join(testDir, 'generated', 'index.ts');
            await mkdir(join(testDir, 'generated'), { recursive: true });
            await writeFile(artifactPath, priorContent, 'utf-8');

            // Use a path where the parent directory doesn't allow writing.
            // On POSIX: make the directory read-only so temp file creation fails.
            const readonlyDir = join(testDir, 'readonly');
            await mkdir(readonlyDir, { recursive: true });
            const { chmod } = await import('node:fs/promises');
            await chmod(readonlyDir, 0o555);

            const readonlyTarget = join(readonlyDir, 'index.ts');

            try {
              // Attempt to write — should fail because directory is read-only
              await expect(
                writeArtifact(readonlyTarget, newSource, norm),
              ).rejects.toThrow();
            } finally {
              // Restore permissions for cleanup
              await chmod(readonlyDir, 0o755);
            }

            // The original artifact must remain unchanged
            const afterContent = await readFile(artifactPath, 'utf-8');
            expect(afterContent).toBe(priorContent);
          },
        ),
        { numRuns: 100 },
      );
    },
    60_000,
  );
});
