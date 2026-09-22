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

function setupProject(dir: string, attached = true, withStreams = attached): void {
  const loxtepDir = join(dir, '.loxtep');
  mkdirSync(loxtepDir, { recursive: true });
  const config: Record<string, unknown> = {
    project_id: 'proj_test_123',
  };
  if (attached) {
    config.instance_id = 'inst_test_456';
    config.api_url = 'https://api.loxtep.io';
  }
  if (withStreams) {
    config.streams = {
      Region: 'us-east-1',
      LeoEvent: 'LeoEvent',
      LeoStream: 'LeoStream',
      LeoCron: 'LeoCron',
      LeoS3: 'LeoS3',
      LeoKinesisStream: 'LeoKinesis',
      LeoFirehoseStream: 'LeoFirehose',
      LeoSettings: 'LeoSettings',
    };
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

    it('fails when attached without stream-config cache', async () => {
      setupProject(tempDir, true, false);
      const result = await runTestCommand({
        cwd: tempDir,
        moduleName: 'my-workflow',
        eventFile: 'event.json',
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join(' ')).toContain('stream-config');
      expect(result.stderr.join(' ')).toContain('blocked');
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

  describe('handler execution', () => {
    it('runs handler and prints action trace with harness client', async () => {
      const { createLocalProjectHarness } = await import('../__tests__/cli-test-harness.js');
      const harness = await createLocalProjectHarness();
      try {
        setupWorkflowModule(harness.projectDir, 'echo-wf', {
          handlerBody: '/* ok */',
        });
        setupEventFile(harness.projectDir, 'event.json', { hello: true });

        const result = await runTestCommand({
          cwd: harness.projectDir,
          moduleName: 'echo-wf',
          eventFile: 'event.json',
          cliOptions: harness.cliOptions,
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.join('\n')).toContain('Test completed');
        expect(result.stdout.join('\n')).toContain('handler.complete');
        expect(result.stdout.join('\n')).toContain('Action Trace');
      } finally {
        await harness.destroy();
      }
    });

    it('returns nonzero exit when handler throws a non-skip error', async () => {
      const { createLocalProjectHarness } = await import('../__tests__/cli-test-harness.js');
      const harness = await createLocalProjectHarness();
      try {
        setupWorkflowModule(harness.projectDir, 'boom-wf', {
          handlerBody: 'throw new Error("handler boom");',
        });
        setupEventFile(harness.projectDir, 'event.json', {});

        const result = await runTestCommand({
          cwd: harness.projectDir,
          moduleName: 'boom-wf',
          eventFile: 'event.json',
          cliOptions: harness.cliOptions,
        });
        expect(result.exitCode).toBe(1);
        expect(result.stdout.join('\n')).toContain('handler.error');
        expect(result.stdout.join('\n')).toContain('handler boom');
      } finally {
        await harness.destroy();
      }
    });

    it('returns nonzero exit when GuardedOperationSkipped (rejection)', async () => {
      const { createLocalProjectHarness } = await import('../__tests__/cli-test-harness.js');
      const harness = await createLocalProjectHarness();
      try {
        setupWorkflowModule(harness.projectDir, 'guard-wf', {
          requireApproval: ['dataProducts.write'],
          handlerBody:
            'await ctx.toolbox.dataProducts.write({ id: "dp", name: "orders" }, event);',
        });
        setupEventFile(harness.projectDir, 'event.json', { x: 1 });

        const result = await runTestCommand({
          cwd: harness.projectDir,
          moduleName: 'guard-wf',
          eventFile: 'event.json',
          cliOptions: harness.cliOptions,
          promptFn: mockPromptReject(),
        });
        expect(result.exitCode).toBe(1);
        expect(result.stdout.join('\n')).toContain('dataProducts.write');
        expect(result.stdout.join('\n')).not.toContain('handler.error');
        expect(result.stdout.join('\n')).toContain('guarded operation skipped');
      } finally {
        await harness.destroy();
      }
    });

    it('returns nonzero exit when GuardedOperationSkipped (timeout)', async () => {
      const { createLocalProjectHarness } = await import('../__tests__/cli-test-harness.js');
      const harness = await createLocalProjectHarness();
      try {
        setupWorkflowModule(harness.projectDir, 'guard-timeout-wf', {
          requireApproval: ['dataProducts.write'],
          handlerBody:
            'await ctx.toolbox.dataProducts.write({ id: "dp", name: "orders" }, event);',
        });
        setupEventFile(harness.projectDir, 'event.json', { x: 1 });

        const result = await runTestCommand({
          cwd: harness.projectDir,
          moduleName: 'guard-timeout-wf',
          eventFile: 'event.json',
          cliOptions: harness.cliOptions,
          promptFn: mockPromptTimeout(),
        });
        expect(result.exitCode).toBe(1);
        expect(result.stdout.join('\n')).toContain('timed out');
      } finally {
        await harness.destroy();
      }
    });

    it('surfaces underlying TypeScript load errors instead of only module-not-found', async () => {
      setupProject(tempDir);
      setupEventFile(tempDir, 'event.json', { type: 'test' });
      const workflowsDir = join(tempDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, 'broken-wf.ts'),
        `throw new Error('intentional module load failure');\n` +
          `export default { name: 'broken-wf', triggers: [{ kind: 'webhook', path: '/x' }], handler: async () => {} };\n`
      );

      const result = await runTestCommand({
        cwd: tempDir,
        moduleName: 'broken-wf',
        eventFile: 'event.json',
      });
      expect(result.exitCode).toBe(1);
      const errText = result.stderr.join('\n');
      expect(errText).toMatch(/not found|Underlying load error/i);
      expect(errText).toContain('broken-wf.ts');
      expect(errText).toContain('intentional module load failure');
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

  it('wraps remaining toolbox methods and records failures', async () => {
    (mockToolbox.dataProducts.query as jest.Mock).mockRejectedValue(new Error('query failed'));
    (mockToolbox.connections.test as jest.Mock).mockResolvedValue({ success: true });
    (mockToolbox.workflows.getGraph as jest.Mock).mockResolvedValue({ nodes: [] });

    const guarded = createApprovalGuardedToolbox(
      mockToolbox,
      new Set(['dataProducts.query']),
      trace,
      mockPromptApprove()
    );

    await expect(
      guarded.dataProducts.query({ id: 'dp_1', name: 'orders' }, 'SELECT 1')
    ).rejects.toThrow(/query failed/);
    await guarded.connections.list();
    await guarded.connections.get('conn_1');
    await guarded.connections.test('conn_1');
    await guarded.workflows.list();
    await guarded.workflows.getGraph({ id: 'wf_1', name: 'main' });
    await guarded.queues.getMetadata({ id: 'q_1', name: 'events' });

    const entries = trace.getEntries();
    expect(entries.some(e => e.operationName === 'dataProducts.query' && e.outcome === 'failed')).toBe(
      true
    );
    expect(entries.some(e => e.operationName === 'workflows.getGraph')).toBe(true);
  });
});

describe('promptApproval', () => {
  it('approves y/yes answers and rejects others via injected readline', async () => {
    const makeRl = (answer: string) =>
      ({
        question: (_prompt: string, cb: (a: string) => void) => cb(answer),
        close: jest.fn(),
      }) as unknown as import('node:readline').Interface;

    await expect(promptApproval('op', 'target', makeRl('y'))).resolves.toEqual({
      approved: true,
      timedOut: false,
    });
    await expect(promptApproval('op', 'target', makeRl('YES'))).resolves.toEqual({
      approved: true,
      timedOut: false,
    });
    await expect(promptApproval('op', 'target', makeRl('n'))).resolves.toEqual({
      approved: false,
      timedOut: false,
    });
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

describe('runTest CLI entry', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
    process.exitCode = 0;
  });

  it('prints usage when module name is missing', async () => {
    process.argv = ['node', 'loxtep', 'test'];
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { runTest } = await import('./test-cmd.js');
    await runTest();
    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join(' ')).toContain('Usage: loxtep test');
    errSpy.mockRestore();
  });

  it('prints usage when --event is missing', async () => {
    process.argv = ['node', 'loxtep', 'test', 'my-workflow'];
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { runTest } = await import('./test-cmd.js');
    await runTest();
    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join(' ')).toContain('Missing required --event');
    errSpy.mockRestore();
  });
});
