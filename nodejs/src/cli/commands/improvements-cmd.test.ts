/**
 * Unit tests for `loxtep improvements list|apply|reject`.
 *
 * Validates:
 * - R8.3: List improvements via SDK + CLI
 * - R8.4: Apply writes proposed_change into module file atomically, sets status to applied
 * - R8.5: Reject sets status to rejected
 * - R8.6: Guard unknown-id/non-proposed with non-zero exit and no state change
 * - R8.7: On write failure during apply, file unchanged, status stays proposed
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runImprovementsListCommand,
  runImprovementsApplyCommand,
  runImprovementsRejectCommand,
} from './improvements-cmd.js';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Improvement } from '../../client/improvements-types.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `loxtep-imp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function scaffoldProject(dir: string, config: Record<string, unknown> = { project_id: 'proj_test1' }): void {
  const loxtepDir = join(dir, '.loxtep');
  mkdirSync(loxtepDir, { recursive: true });
  writeFileSync(join(loxtepDir, 'project.json'), JSON.stringify(config, null, 2));
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

function mockClient(opts: {
  improvements?: Improvement[];
  listError?: Error;
  applyResult?: { id: string; status: 'applied'; updated_at: string };
  applyError?: Error;
  rejectResult?: { id: string; status: 'rejected'; updated_at: string };
  rejectError?: Error;
}): LoxtepClient {
  return {
    improvements: {
      list: async () => {
        if (opts.listError) throw opts.listError;
        return { improvements: opts.improvements ?? [makeImprovement()], cursor: null };
      },
      apply: async (id: string) => {
        if (opts.applyError) throw opts.applyError;
        return opts.applyResult ?? { id, status: 'applied' as const, updated_at: new Date().toISOString() };
      },
      reject: async (id: string) => {
        if (opts.rejectError) throw opts.rejectError;
        return opts.rejectResult ?? { id, status: 'rejected' as const, updated_at: new Date().toISOString() };
      },
    },
  } as unknown as LoxtepClient;
}

describe('loxtep improvements list', () => {
  it('lists improvements successfully (R8.3)', async () => {
    const client = mockClient({
      improvements: [
        makeImprovement({ id: 'imp_001', workflow_name: 'orders-sync', status: 'proposed' }),
        makeImprovement({ id: 'imp_002', workflow_name: 'users-etl', status: 'applied' }),
      ],
    });
    const result = await runImprovementsListCommand(client);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join('\n')).toContain('imp_001');
    expect(result.stdout.join('\n')).toContain('orders-sync');
    expect(result.stdout.join('\n')).toContain('imp_002');
    expect(result.stdout.join('\n')).toContain('users-etl');
  });

  it('prints "No improvements found" for empty list', async () => {
    const client = mockClient({ improvements: [] });
    const result = await runImprovementsListCommand(client);
    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain('No improvements found');
  });

  it('passes status filter to the API', async () => {
    let capturedFilters: any;
    const client = {
      improvements: {
        list: async (filters?: any) => {
          capturedFilters = filters;
          return { improvements: [], cursor: null };
        },
      },
    } as unknown as LoxtepClient;

    await runImprovementsListCommand(client, { status: 'proposed' });
    expect(capturedFilters).toEqual({ status: 'proposed' });
  });

  it('rejects invalid status filter', async () => {
    const client = mockClient({});
    const result = await runImprovementsListCommand(client, { status: 'invalid' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Invalid status filter');
  });

  it('reports API errors with non-zero exit', async () => {
    const client = mockClient({ listError: new Error('Unauthorized') });
    const result = await runImprovementsListCommand(client);
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Unauthorized');
  });
});

describe('loxtep improvements apply', () => {
  let tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  it('writes proposed_change into the workflow file and sets status to applied (R8.4)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    scaffoldProject(dir);
    const originalContent = 'export default defineDataWorkflow({ name: "orders-sync" });';
    const filePath = scaffoldWorkflow(dir, 'orders-sync', originalContent);

    const proposedChange = 'export default defineDataWorkflow({ name: "orders-sync-v2" });';
    const improvement = makeImprovement({ id: 'imp_001', workflow_name: 'orders-sync', proposed_change: proposedChange });

    let applyCalled = false;
    const client = {
      improvements: {
        list: async () => ({ improvements: [improvement], cursor: null }),
        apply: async (id: string) => {
          applyCalled = true;
          return { id, status: 'applied' as const, updated_at: new Date().toISOString() };
        },
        reject: async () => ({ id: 'imp_001', status: 'rejected' as const, updated_at: '' }),
      },
    } as unknown as LoxtepClient;

    const result = await runImprovementsApplyCommand(client, 'imp_001', dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain('Applied');
    expect(applyCalled).toBe(true);

    // Verify file was written with proposed_change
    const written = readFileSync(filePath, 'utf-8');
    expect(written).toBe(proposedChange);
  });

  it('exits non-zero for unknown id (R8.6)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    scaffoldProject(dir);

    const client = mockClient({ improvements: [] });
    const result = await runImprovementsApplyCommand(client, 'imp_nonexistent', dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('not found');
  });

  it('exits non-zero for non-proposed status (R8.6)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    scaffoldProject(dir);

    const improvement = makeImprovement({ id: 'imp_001', status: 'applied' });
    const client = mockClient({ improvements: [improvement] });

    const result = await runImprovementsApplyCommand(client, 'imp_001', dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain("status 'applied'");
    expect(result.stderr[0]).toContain("not 'proposed'");
  });

  it('exits non-zero when workflow file cannot be located, status stays proposed (R8.7)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    scaffoldProject(dir);
    // No workflows directory / file created

    const improvement = makeImprovement({ id: 'imp_001', workflow_name: 'missing-workflow' });
    let applyCalled = false;
    const client = {
      improvements: {
        list: async () => ({ improvements: [improvement], cursor: null }),
        apply: async () => { applyCalled = true; return { id: 'imp_001', status: 'applied' as const, updated_at: '' }; },
        reject: async () => ({ id: 'imp_001', status: 'rejected' as const, updated_at: '' }),
      },
    } as unknown as LoxtepClient;

    const result = await runImprovementsApplyCommand(client, 'imp_001', dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Cannot locate');
    expect(result.stderr[0]).toContain("status remains 'proposed'");
    // API apply should NOT have been called
    expect(applyCalled).toBe(false);
  });

  it('on file write failure, file stays unchanged and status stays proposed (R8.7)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    scaffoldProject(dir);

    // Create workflows dir but make it unwritable to simulate write failure
    const workflowsDir = join(dir, 'workflows');
    mkdirSync(workflowsDir, { recursive: true });
    const filePath = join(workflowsDir, 'orders-sync.ts');
    const originalContent = 'original content';
    writeFileSync(filePath, originalContent);

    // Make the workflows directory read-only to prevent temp file creation
    chmodSync(workflowsDir, 0o555);

    const improvement = makeImprovement({ id: 'imp_001', workflow_name: 'orders-sync' });
    let applyCalled = false;
    const client = {
      improvements: {
        list: async () => ({ improvements: [improvement], cursor: null }),
        apply: async () => { applyCalled = true; return { id: 'imp_001', status: 'applied' as const, updated_at: '' }; },
        reject: async () => ({ id: 'imp_001', status: 'rejected' as const, updated_at: '' }),
      },
    } as unknown as LoxtepClient;

    try {
      const result = await runImprovementsApplyCommand(client, 'imp_001', dir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr[0]).toContain('Failed to write');
      expect(result.stderr[0]).toContain("status remains 'proposed'");
      expect(applyCalled).toBe(false);

      // File should be unchanged
      const afterContent = readFileSync(filePath, 'utf-8');
      expect(afterContent).toBe(originalContent);
    } finally {
      // Restore permissions for cleanup
      chmodSync(workflowsDir, 0o755);
    }
  });

  it('exits non-zero when no project.json found', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    // No project scaffolded

    const client = mockClient({});
    const result = await runImprovementsApplyCommand(client, 'imp_001', dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('loxtep init');
  });
});

describe('loxtep improvements reject', () => {
  it('rejects an improvement successfully (R8.5)', async () => {
    const client = mockClient({});
    const result = await runImprovementsRejectCommand(client, 'imp_001');
    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain('Rejected');
    expect(result.stdout[0]).toContain("'rejected'");
  });

  it('exits non-zero when API returns error for unknown id (R8.6)', async () => {
    const client = mockClient({
      rejectError: new Error("No improvement found with id 'imp_bad'"),
    });
    const result = await runImprovementsRejectCommand(client, 'imp_bad');
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('imp_bad');
  });

  it('exits non-zero when API returns error for non-proposed status (R8.6)', async () => {
    const client = mockClient({
      rejectError: new Error("Improvement 'imp_001' is in status 'applied', not 'proposed'"),
    });
    const result = await runImprovementsRejectCommand(client, 'imp_001');
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain("status 'applied'");
  });
});
