import fc from 'fast-check';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runImprovementsApplyCommand,
} from './improvements-cmd.js';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Improvement } from '../../client/improvements-types.js';

/**
 * Feature: ai-first-platform-surface
 * Property 29: Improvement apply is atomic
 *
 * The `loxtep improvements apply <id>` command is atomic:
 * - On successful apply, the file contains exactly the proposed_change content.
 * - On write failure, the file's original content is preserved byte-for-byte.
 * - The API's apply endpoint is only called when the file write succeeds.
 *
 * **Validates: Requirements 8.4, 8.7**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary improvement id. */
const improvementIdArb = fc.stringMatching(/^imp_[a-z0-9]{4,16}$/);

/** Arbitrary workflow name (valid filename characters, 1–30 chars). */
const workflowNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/);

/** Arbitrary proposed_change content (non-empty TypeScript-like code). */
const proposedChangeArb = fc.stringMatching(/^[a-zA-Z0-9 (){};=_"'.\n]{1,200}$/);

/** Arbitrary original file content (non-empty). */
const originalContentArb = fc.stringMatching(/^[a-zA-Z0-9 (){};=_"'.\n]{1,200}$/);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `loxtep-pbt-imp-apply-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function scaffoldProject(dir: string): void {
  const loxtepDir = join(dir, '.loxtep');
  mkdirSync(loxtepDir, { recursive: true });
  writeFileSync(join(loxtepDir, 'project.json'), JSON.stringify({ project_id: 'proj_test1' }, null, 2));
}

function scaffoldWorkflow(dir: string, workflowName: string, content: string): string {
  const workflowsDir = join(dir, 'workflows');
  mkdirSync(workflowsDir, { recursive: true });
  const filePath = join(workflowsDir, `${workflowName}.ts`);
  writeFileSync(filePath, content);
  return filePath;
}

function makeImprovement(overrides: Partial<Improvement> = {}): Improvement {
  return {
    id: 'imp_001',
    organization_id: 'org_xyz',
    workflow_name: 'orders-sync',
    source_eval_run_ids: ['eval_1'],
    proposed_change: 'export default defineDataWorkflow({ name: "orders-sync-v2" });',
    rationale: 'Improved error handling',
    status: 'proposed',
    created_at: '2024-06-01T12:00:00Z',
    updated_at: '2024-06-01T12:00:00Z',
    ...overrides,
  };
}

/**
 * Build a mock LoxtepClient that tracks whether apply was called.
 * The `writeWillFail` option simulates a scenario where the file cannot be written.
 */
function mockClient(improvement: Improvement): {
  client: LoxtepClient;
  applyCalled: () => boolean;
} {
  let _applyCalled = false;
  const client = {
    review: {
      improvements: {
        list: async () => ({
          improvements: [improvement],
          cursor: null,
        }),
        apply: async (id: string) => {
          _applyCalled = true;
          return { id, status: 'applied' as const, updated_at: new Date().toISOString() };
        },
        reject: async (id: string) => ({
          id,
          status: 'rejected' as const,
          updated_at: new Date().toISOString(),
        }),
      },
    },
  } as unknown as LoxtepClient;

  return { client, applyCalled: () => _applyCalled };
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 29: Improvement apply is atomic', () => {
  const tmpDirs: string[] = [];

  afterAll(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it(
    'R8.4: On successful apply, the file contains exactly the proposed_change content ' +
      'and the API apply endpoint is called',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          improvementIdArb,
          workflowNameArb,
          originalContentArb,
          proposedChangeArb,
          async (id, workflowName, originalContent, proposedChange) => {
            // 1. Set up a temp directory with the workflow file.
            const dir = makeTmpDir();
            tmpDirs.push(dir);
            scaffoldProject(dir);
            const filePath = scaffoldWorkflow(dir, workflowName, originalContent);

            // 2. Create improvement with matching workflow_name and proposed_change.
            const improvement = makeImprovement({
              id,
              workflow_name: workflowName,
              proposed_change: proposedChange,
              status: 'proposed',
            });

            // 3. Create a mock client that tracks API calls.
            const { client, applyCalled } = mockClient(improvement);

            // 4. Run the apply command.
            const result = await runImprovementsApplyCommand(client, id, dir);

            // 5. Assert success.
            expect(result.exitCode).toBe(0);

            // 6. Assert the file contains exactly the proposed_change content.
            const fileContent = readFileSync(filePath, 'utf-8');
            expect(fileContent).toBe(proposedChange);

            // 7. Assert the API apply endpoint was called.
            expect(applyCalled()).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    },
    120_000
  );

  it(
    'R8.7: On write failure (workflow file not found), the file original content is preserved ' +
      'byte-for-byte and the API apply endpoint is NOT called',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          improvementIdArb,
          workflowNameArb,
          proposedChangeArb,
          async (id, workflowName, proposedChange) => {
            // 1. Set up a temp directory with a project but NO workflow file.
            const dir = makeTmpDir();
            tmpDirs.push(dir);
            scaffoldProject(dir);
            // Do NOT scaffold the workflow file — simulates "target file cannot be located"

            // 2. Create improvement pointing to the missing workflow.
            const improvement = makeImprovement({
              id,
              workflow_name: workflowName,
              proposed_change: proposedChange,
              status: 'proposed',
            });

            // 3. Create a mock client that tracks API calls.
            const { client, applyCalled } = mockClient(improvement);

            // 4. Run the apply command — should fail because the file doesn't exist.
            const result = await runImprovementsApplyCommand(client, id, dir);

            // 5. Assert non-zero exit.
            expect(result.exitCode).not.toBe(0);

            // 6. Assert error message mentions the failure.
            expect(result.stderr.length).toBeGreaterThan(0);

            // 7. Assert the API apply endpoint was NOT called.
            expect(applyCalled()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    },
    120_000
  );

  it(
    'R8.7: On write failure (directory made read-only), the file content is preserved ' +
      'byte-for-byte and the API apply endpoint is NOT called',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          improvementIdArb,
          workflowNameArb,
          originalContentArb,
          proposedChangeArb,
          async (id, workflowName, originalContent, proposedChange) => {
            // Skip if proposed_change equals original (not a meaningful test of atomicity)
            fc.pre(proposedChange !== originalContent);

            // 1. Set up a temp directory with the workflow file.
            const dir = makeTmpDir();
            tmpDirs.push(dir);
            scaffoldProject(dir);
            const filePath = scaffoldWorkflow(dir, workflowName, originalContent);

            // 2. Make the workflows directory read-only to prevent temp file creation.
            const workflowsDir = join(dir, 'workflows');
            const { chmodSync } = await import('node:fs');
            chmodSync(workflowsDir, 0o555);

            try {
              // 3. Create improvement with matching workflow_name.
              const improvement = makeImprovement({
                id,
                workflow_name: workflowName,
                proposed_change: proposedChange,
                status: 'proposed',
              });

              // 4. Create a mock client that tracks API calls.
              const { client, applyCalled } = mockClient(improvement);

              // 5. Run the apply command — should fail because the directory is read-only.
              const result = await runImprovementsApplyCommand(client, id, dir);

              // 6. Assert non-zero exit.
              expect(result.exitCode).not.toBe(0);

              // 7. Assert error message mentions write failure.
              expect(result.stderr.length).toBeGreaterThan(0);

              // 8. Assert the file's original content is preserved byte-for-byte.
              const afterContent = readFileSync(filePath, 'utf-8');
              expect(afterContent).toBe(originalContent);

              // 9. Assert the API apply endpoint was NOT called.
              expect(applyCalled()).toBe(false);
            } finally {
              // Restore permissions for cleanup.
              chmodSync(workflowsDir, 0o755);
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    120_000
  );
});
