/**
 * Unit tests for `loxtep test <module> --event <file>`.
 *
 * Tests the core logic of the test command:
 * - Precondition checks (project exists, attached)
 * - Module loading
 * - Event file reading
 * - Approval prompt flow (approve, reject, timeout)
 * - Action trace recording
 *
 * Requirements: 1.5, 6.2, 6.3
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  runTestCommand,
  promptApproval,
  createApprovalGuardedToolbox,
  GuardedOperationSkipped,
} from './test-cmd.js';
import { ActionTrace } from '../../authoring/agent.js';
import type { Toolbox } from '../../authoring/toolbox.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createTempDir(): string {
  const dir = join(tmpdir(), `loxtep-test-cmd-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function setupProject(dir: string, attached = true): void {
  const loxtepDir = join(dir, '.loxtep');
  mkdirSync(loxtepDir, { recursive: true });
  const config: Record<string, unknown> = {
    project_id: 'proj_test_123',
  };
  if (attached) {
    config.instance_id = 'inst_test_456';
    config.api_url = 'https://api.loxtep.io';
  }
  writeFileSync(join(loxtepDir, 'project.json'), JSON.stringify(config, null, 2));
}

function setupWorkflowModule(dir: string, name: string, opts: {
  requireApproval?: string[];
  handlerBody?: string;
} = {}): void {
  const workflowsDir = join(dir, 'workflows');
  mkdirSync(workflowsDir, { recursive: true });

  const approvalArr = opts.requireApproval
    ? JSON.stringify(opts.requireApproval)
    : '[]';
  const handlerBody = opts.handlerBody ?? '/* noop */';

  const content = `
module.exports = {
  name: '${name}',
  triggers: [{ kind: 'queue', ref: { id: 'q_1', name: 'test_queue' } }],
  requireApproval: ${approvalArr},
  handler: async function(ctx, event) { ${handlerBody} },
};
`;
  writeFileSync(join(workflowsDir, `${name}.js`), content);
}

function setupEventFile(dir: string, filename: string, event: unknown): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(event));
  return filePath;
}

// ─── Mock prompt factory ─────────────────────────────────────────────────────

function mockPromptApprove(): (opName: string, target: string) => Promise<{ approved: boolean; timedOut: boolean }> {
  return async () => ({ approved: true, timedOut: false });
}

function mockPromptReject(): (opName: string, target: string) => Promise<{ approved: boolean; timedOut: boolean }> {
  return async () => ({ approved: false, timedOut: false });
}

function mockPromptTimeout(): (opName: string, target: string) => Promise<{ approved: boolean; timedOut: boolean }> {
  return async () => ({ approved: false, timedOut: true });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('loxtep test command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('preconditions', () => {
    it('fails with NO_PROJECT when no .loxtep/project.json exists', async () => {
      const result = await runTestCommand({
        cwd: tempDir,
        moduleName: 'my-workflow',
        eventFile: 'event.json',
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr[0]).toContain('loxtep init');
    });

    it('fails with NOT_ATTACHED when project is not attached', async () => {
      setupProject(tempDir, false);
      const result = await runTestCommand({
        cwd: tempDir,
        moduleName: 'my-workflow',
        eventFile: 'event.json',
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr[0]).toContain('loxtep attach');
    });
  });

  describe('module loading', () => {
    it('fails when the named module cannot be found', async () => {
      setupProject(tempDir);
      setupEventFile(tempDir, 'event.json', { type: 'test' });

      const result = await runTestCommand({
        cwd: tempDir,
        moduleName: 'nonexistent-module',
        eventFile: 'event.json',
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr[0]).toContain('not found');
      expect(result.stderr[0]).toContain('nonexistent-module');
    });
  });

  describe('event file', () => {
    it('fails when the event file cannot be read', async () => {
      setupProject(tempDir);
      setupWorkflowModule(tempDir, 'my-workflow');

      const result = await runTestCommand({
        cwd: tempDir,
        moduleName: 'my-workflow',
        eventFile: 'missing-event.json',
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr[0]).toContain('Failed to read event file');
    });

    it('fails when the event file is not valid JSON', async () => {
      setupProject(tempDir);
      setupWorkflowModule(tempDir, 'my-workflow');
      writeFileSync(join(tempDir, 'bad.json'), 'not json {{{');

      const result = await runTestCommand({
        cwd: tempDir,
        moduleName: 'my-workflow',
        eventFile: 'bad.json',
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr[0]).toContain('Failed to read event file');
    });
  });
});

describe('createApprovalGuardedToolbox', () => {
  let mockToolbox: Toolbox;
  let trace: ActionTrace;

  beforeEach(() => {
    trace = new ActionTrace();
    mockToolbox = {
      dataProducts: {
        write: jest.fn().mockResolvedValue({ success: true, events_written: 1 }),
        query: jest.fn().mockResolvedValue({ items: [], metadata: {} }),
        get: jest.fn().mockResolvedValue({ id: 'dp_1', name: 'test' }),
        list: jest.fn().mockResolvedValue([]),
      },
      queues: {
        write: jest.fn().mockResolvedValue(undefined),
        getMetadata: jest.fn().mockResolvedValue({ queue_name: 'test' }),
      },
      connections: {
        list: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockResolvedValue({ id: 'conn_1' }),
        test: jest.fn().mockResolvedValue({ success: true }),
      },
      workflows: {
        list: jest.fn().mockResolvedValue([]),
        getGraph: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
      },
    };
  });

  it('executes operation on approval', async () => {
    const guardedOps = new Set(['dataProducts.write']);
    const guarded = createApprovalGuardedToolbox(
      mockToolbox,
      guardedOps,
      trace,
      mockPromptApprove()
    );

    const ref = { id: 'dp_1', name: 'orders' };
    await guarded.dataProducts.write(ref, { type: 'test' });

    expect(mockToolbox.dataProducts.write).toHaveBeenCalledWith(ref, { type: 'test' });
    const entries = trace.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('succeeded');
    expect(entries[0].operationName).toBe('dataProducts.write');
  });

  it('skips operation and records on rejection (R6.3)', async () => {
    const guardedOps = new Set(['dataProducts.write']);
    const guarded = createApprovalGuardedToolbox(
      mockToolbox,
      guardedOps,
      trace,
      mockPromptReject()
    );

    const ref = { id: 'dp_1', name: 'orders' };
    await expect(guarded.dataProducts.write(ref, { type: 'test' }))
      .rejects.toThrow(GuardedOperationSkipped);

    expect(mockToolbox.dataProducts.write).not.toHaveBeenCalled();
    const entries = trace.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('failed');
    expect(entries[0].error).toContain('rejected by user');
  });

  it('skips operation and records on timeout (R6.3)', async () => {
    const guardedOps = new Set(['queues.write']);
    const guarded = createApprovalGuardedToolbox(
      mockToolbox,
      guardedOps,
      trace,
      mockPromptTimeout()
    );

    const ref = { id: 'q_1', name: 'events' };
    await expect(guarded.queues.write(ref, { type: 'test' }))
      .rejects.toThrow(GuardedOperationSkipped);

    expect(mockToolbox.queues.write).not.toHaveBeenCalled();
    const entries = trace.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('failed');
    expect(entries[0].error).toContain('timed out');
  });

  it('does not prompt for non-guarded operations', async () => {
    const guardedOps = new Set(['dataProducts.write']);
    const promptFn = jest.fn().mockResolvedValue({ approved: true, timedOut: false });
    const guarded = createApprovalGuardedToolbox(mockToolbox, guardedOps, trace, promptFn);

    // list is NOT guarded
    await guarded.dataProducts.list();

    expect(promptFn).not.toHaveBeenCalled();
    expect(mockToolbox.dataProducts.list).toHaveBeenCalled();
  });

  it('records operation target resource in trace', async () => {
    const guardedOps = new Set<string>();
    const guarded = createApprovalGuardedToolbox(
      mockToolbox,
      guardedOps,
      trace,
      mockPromptApprove()
    );

    const ref = { id: 'dp_1', name: 'orders' };
    await guarded.dataProducts.get(ref);

    const entries = trace.getEntries();
    expect(entries[0].targetResource).toBe('orders');
  });
});

describe('GuardedOperationSkipped', () => {
  it('captures operation name and target', () => {
    const err = new GuardedOperationSkipped('dataProducts.write', 'orders', false);
    expect(err.operationName).toBe('dataProducts.write');
    expect(err.targetResource).toBe('orders');
    expect(err.timedOut).toBe(false);
    expect(err.message).toContain('rejected by user');
  });

  it('indicates timeout when timed out', () => {
    const err = new GuardedOperationSkipped('queues.write', 'events', true);
    expect(err.timedOut).toBe(true);
    expect(err.message).toContain('timed out');
  });
});
