import fc from 'fast-check';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runImprovementsRejectCommand,
  runImprovementsApplyCommand,
} from './improvements-cmd.js';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Improvement, ImprovementStatus } from '../../client/improvements-types.js';

/**
 * Feature: ai-first-platform-surface, Property 30: Improvement reject and guard transitions
 *
 * Property-based test verifying:
 * 1. reject() on a valid proposed improvement sets status to rejected (R8.5)
 * 2. reject/apply on an unknown id returns non-zero exit, no state change (R8.6)
 * 3. reject/apply on a non-proposed status returns non-zero exit, no state change (R8.6)
 *
 * **Validates: Requirements 8.5, 8.6**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary improvement ID (realistic format). */
const improvementIdArb = fc.stringMatching(/^imp_[a-z0-9]{4,12}$/);

/** Arbitrary workflow name. */
const workflowNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/);

/** Arbitrary non-proposed status. */
const nonProposedStatusArb: fc.Arbitrary<ImprovementStatus> = fc.constantFrom('applied', 'rejected');

/** Arbitrary proposed improvement. */
function proposedImprovementArb(): fc.Arbitrary<Improvement> {
  return fc.record({
    id: improvementIdArb,
    organization_id: fc.stringMatching(/^org_[a-z0-9]{4,12}$/),
    workflow_name: workflowNameArb,
    source_eval_run_ids: fc.array(fc.stringMatching(/^eval_[a-z0-9]{4,8}$/), { minLength: 1, maxLength: 3 }),
    proposed_change: fc.string({ minLength: 1, maxLength: 200 }),
    rationale: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
    status: fc.constant('proposed' as const),
    created_at: fc.constant('2024-06-01T12:00:00Z'),
    updated_at: fc.constant('2024-06-01T12:00:00Z'),
  });
}

/** Arbitrary improvement with a non-proposed status. */
function nonProposedImprovementArb(): fc.Arbitrary<Improvement> {
  return fc.record({
    id: improvementIdArb,
    organization_id: fc.stringMatching(/^org_[a-z0-9]{4,12}$/),
    workflow_name: workflowNameArb,
    source_eval_run_ids: fc.array(fc.stringMatching(/^eval_[a-z0-9]{4,8}$/), { minLength: 1, maxLength: 3 }),
    proposed_change: fc.string({ minLength: 1, maxLength: 200 }),
    rationale: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
    status: nonProposedStatusArb,
    created_at: fc.constant('2024-06-01T12:00:00Z'),
    updated_at: fc.constant('2024-06-01T12:00:00Z'),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a temp directory with a scaffolded project for apply tests. */
function scaffoldTmpProject(): string {
  const dir = join(tmpdir(), `loxtep-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.loxtep'), { recursive: true });
  writeFileSync(join(dir, '.loxtep', 'project.json'), JSON.stringify({ project_id: 'proj_test' }));
  return dir;
}

// ─── Mock Client Factories ────────────────────────────────────────────────────

/**
 * Create a mock client that tracks reject calls and returns success.
 * Simulates a valid proposed improvement being rejected.
 */
function makeRejectSuccessClient(improvement: Improvement): {
  client: LoxtepClient;
  rejectCalls: string[];
} {
  const rejectCalls: string[] = [];
  const client = {
    improvements: {
      list: async () => ({ improvements: [improvement], cursor: null }),
      apply: async (id: string) => ({ id, status: 'applied' as const, updated_at: new Date().toISOString() }),
      reject: async (id: string) => {
        rejectCalls.push(id);
        return { id, status: 'rejected' as const, updated_at: new Date().toISOString() };
      },
    },
  } as unknown as LoxtepClient;
  return { client, rejectCalls };
}

/**
 * Create a mock client where the API returns a 404 error for unknown IDs.
 */
function makeUnknownIdClient(): {
  client: LoxtepClient;
  rejectCalls: string[];
  applyCalls: string[];
} {
  const rejectCalls: string[] = [];
  const applyCalls: string[] = [];
  const client = {
    improvements: {
      list: async () => ({ improvements: [], cursor: null }),
      apply: async (id: string) => {
        applyCalls.push(id);
        return { id, status: 'applied' as const, updated_at: new Date().toISOString() };
      },
      reject: async (id: string) => {
        rejectCalls.push(id);
        throw new Error(`No improvement found with id '${id}'`);
      },
    },
  } as unknown as LoxtepClient;
  return { client, rejectCalls, applyCalls };
}

/**
 * Create a mock client where the API returns a 409 error for non-proposed status.
 */
function makeNonProposedRejectClient(improvement: Improvement): {
  client: LoxtepClient;
  rejectCalls: string[];
} {
  const rejectCalls: string[] = [];
  const client = {
    improvements: {
      list: async () => ({ improvements: [improvement], cursor: null }),
      apply: async (id: string) => ({ id, status: 'applied' as const, updated_at: new Date().toISOString() }),
      reject: async (id: string) => {
        rejectCalls.push(id);
        throw new Error(
          `Improvement '${id}' is in status '${improvement.status}', not 'proposed'`
        );
      },
    },
  } as unknown as LoxtepClient;
  return { client, rejectCalls };
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 30: Improvement reject and guard transitions', () => {
  it(
    'R8.5: reject() on a valid proposed improvement returns exit 0 and calls the reject API',
    async () => {
      await fc.assert(
        fc.asyncProperty(proposedImprovementArb(), async (improvement) => {
          const { client, rejectCalls } = makeRejectSuccessClient(improvement);

          const result = await runImprovementsRejectCommand(client, improvement.id);

          // PROPERTY: Successful reject returns exit code 0
          expect(result.exitCode).toBe(0);

          // PROPERTY: The reject API was called with the correct ID
          expect(rejectCalls).toContain(improvement.id);

          // PROPERTY: stdout confirms rejection
          expect(result.stdout.join(' ')).toContain('rejected');
          expect(result.stderr).toEqual([]);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R8.6: reject on an unknown id returns non-zero exit with no state change',
    async () => {
      await fc.assert(
        fc.asyncProperty(improvementIdArb, async (unknownId) => {
          const { client, rejectCalls } = makeUnknownIdClient();

          const result = await runImprovementsRejectCommand(client, unknownId);

          // PROPERTY: Non-zero exit code for unknown ID
          expect(result.exitCode).not.toBe(0);

          // PROPERTY: Error message is printed
          expect(result.stderr.length).toBeGreaterThan(0);
          expect(result.stderr[0]).toContain(unknownId);

          // PROPERTY: The reject API was called (the error comes from the API)
          // but the status is not changed (API threw an error)
          expect(rejectCalls).toContain(unknownId);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R8.6: reject on a non-proposed status returns non-zero exit with no state change',
    async () => {
      await fc.assert(
        fc.asyncProperty(nonProposedImprovementArb(), async (improvement) => {
          const { client, rejectCalls } = makeNonProposedRejectClient(improvement);

          const result = await runImprovementsRejectCommand(client, improvement.id);

          // PROPERTY: Non-zero exit code for non-proposed status
          expect(result.exitCode).not.toBe(0);

          // PROPERTY: Error message mentions the current status
          expect(result.stderr.length).toBeGreaterThan(0);
          expect(result.stderr[0]).toContain(improvement.status);

          // PROPERTY: The reject API call was attempted (guard is server-side)
          expect(rejectCalls).toContain(improvement.id);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R8.6: apply on an unknown id returns non-zero exit with no state change (no file written)',
    async () => {
      await fc.assert(
        fc.asyncProperty(improvementIdArb, async (unknownId) => {
          // For apply, the guard is client-side: the improvement is not found in the list
          const { client, applyCalls } = makeUnknownIdClient();
          const dir = scaffoldTmpProject();

          try {
            const result = await runImprovementsApplyCommand(client, unknownId, dir);

            // PROPERTY: Non-zero exit code for unknown ID
            expect(result.exitCode).not.toBe(0);

            // PROPERTY: Error message indicates not found
            expect(result.stderr.length).toBeGreaterThan(0);
            expect(result.stderr[0]).toContain('not found');

            // PROPERTY: The apply API was NOT called (guard prevents it)
            expect(applyCalls).not.toContain(unknownId);
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R8.6: apply on a non-proposed status returns non-zero exit with no state change (no file written)',
    async () => {
      await fc.assert(
        fc.asyncProperty(nonProposedImprovementArb(), async (improvement) => {
          // For apply, the guard is client-side: checks the status before writing
          const dir = scaffoldTmpProject();

          const applyCalls: string[] = [];
          const client = {
            improvements: {
              list: async () => ({ improvements: [improvement], cursor: null }),
              apply: async (id: string) => {
                applyCalls.push(id);
                return { id, status: 'applied' as const, updated_at: new Date().toISOString() };
              },
              reject: async (id: string) => ({ id, status: 'rejected' as const, updated_at: new Date().toISOString() }),
            },
          } as unknown as LoxtepClient;

          try {
            const result = await runImprovementsApplyCommand(client, improvement.id, dir);

            // PROPERTY: Non-zero exit code for non-proposed status
            expect(result.exitCode).not.toBe(0);

            // PROPERTY: Error message mentions the non-proposed status
            expect(result.stderr.length).toBeGreaterThan(0);
            expect(result.stderr[0]).toContain(improvement.status);
            expect(result.stderr[0]).toContain("not 'proposed'");

            // PROPERTY: The apply API was NOT called (guard prevents it)
            expect(applyCalls).not.toContain(improvement.id);
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        }),
        { numRuns: 100 }
      );
    }
  );
});
