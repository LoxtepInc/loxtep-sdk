/**
 * Unit tests for `loxtep deploy` command orchestration.
 *
 * Tests cover:
 * - Precondition guards (NO_PROJECT, NOT_ATTACHED)
 * - Compile error rejection with file:line (R1.11)
 * - Missing resource reference rejection (R1.8)
 * - Deploy target resolution by instance type (R14.4, R14.5)
 * - Resource validation logic
 * - Module discovery
 * - SDK-first JSON-entity workflow package push+activate (deployLocalEntityWorkflows)
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverModuleFiles,
  resolveDeployTarget,
  validateReferencedResources,
  deployLocalEntityWorkflows,
  runDeployCommand,
  type CompileError,
  type MissingRefError,
  type DeployTarget,
} from './deploy-cmd.js';
import { LoxtepClient } from '../../client/loxtep-client.js';
import type { CompiledWorkflow } from '../../authoring/compiler.js';
import type { NormalizedContext } from '../../codegen/types.js';
import type { Instance } from '../../client/instances-types.js';
import { captureCliOutput } from '../__tests__/cli-test-harness.js';
import { runIngestCreate } from './ingest-cmd.js';

// ─── resolveDeployTarget ─────────────────────────────────────────────────────

describe('resolveDeployTarget', () => {
  function makeInstance(instanceType?: string): Instance {
    return {
      instance_id: 'inst_1',
      organization_id: 'org_1',
      name: 'test',
      api_url: 'https://api.test.io',
      region: 'us-east-1',
      stack_id: 'stack_1',
      status: 'active',
      connection_details: {},
      metadata: instanceType ? { instance_type: instanceType } : {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
  }

  it('resolves shared instance to loxtep_infra', () => {
    const result = resolveDeployTarget(makeInstance('shared'));
    expect(result).toEqual({ kind: 'loxtep_infra', instanceType: 'shared' });
  });

  it('resolves managed instance to loxtep_infra', () => {
    const result = resolveDeployTarget(makeInstance('managed'));
    expect(result).toEqual({ kind: 'loxtep_infra', instanceType: 'managed' });
  });

  it('resolves customer instance to customer_data_plane', () => {
    const result = resolveDeployTarget(makeInstance('customer'));
    expect(result).toEqual({ kind: 'customer_data_plane', instanceType: 'customer' });
  });

  it('resolves self-hosted instance to customer_data_plane', () => {
    const result = resolveDeployTarget(makeInstance('self-hosted'));
    expect(result).toEqual({ kind: 'customer_data_plane', instanceType: 'customer' });
  });

  it('defaults to shared when no instance_type is present', () => {
    const result = resolveDeployTarget(makeInstance());
    expect(result).toEqual({ kind: 'loxtep_infra', instanceType: 'shared' });
  });

  it('reads instance_type from connection_details when not in metadata', () => {
    const instance = makeInstance();
    instance.metadata = {};
    instance.connection_details = { instance_type: 'managed' };
    const result = resolveDeployTarget(instance);
    expect(result).toEqual({ kind: 'loxtep_infra', instanceType: 'managed' });
  });
});

// ─── validateReferencedResources ─────────────────────────────────────────────

describe('validateReferencedResources', () => {
  const ctx: NormalizedContext = {
    dataProducts: [{ key: 'orders', data: { name: 'orders', id: 'dp_1', domain: null, schema: null } }],
    connectors: [{ key: 'shopify', data: { type: 'shopify', id: 'cn_1', connection_id: null, name: 'shopify' } }],
    domains: [{ key: 'commerce', data: { name: 'commerce', id: 'dm_1', data_product_ids: ['dp_1'] } }],
    queues: [{ key: 'orders_raw', data: { name: 'orders_raw', id: 'q_1' } }],
    flows: [],
    workflows: [{ key: 'my_wf', data: { name: 'my_wf', id: 'wf_1' } }],
  };

  it('returns empty array when all refs exist', () => {
    const compiled: CompiledWorkflow = {
      name: 'test_wf',
      ops: [],
      referencedResources: [
        { type: 'queue', id: 'q_1', name: 'orders_raw' },
        { type: 'connector', id: 'cn_1', name: 'shopify' },
      ],
    };
    const result = validateReferencedResources(
      [{ compiled, file: 'my-workflow.ts' }],
      ctx
    );
    expect(result).toEqual([]);
  });

  it('returns missing refs when resources do not exist', () => {
    const compiled: CompiledWorkflow = {
      name: 'test_wf',
      ops: [],
      referencedResources: [
        { type: 'queue', id: 'q_999', name: 'nonexistent_queue' },
        { type: 'connector', id: 'cn_999', name: 'missing_connector' },
      ],
    };
    const result = validateReferencedResources(
      [{ compiled, file: 'broken-workflow.ts' }],
      ctx
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      file: 'broken-workflow.ts',
      type: 'queue',
      id: 'q_999',
      name: 'nonexistent_queue',
    });
    expect(result[1]).toMatchObject({
      file: 'broken-workflow.ts',
      type: 'connector',
      id: 'cn_999',
      name: 'missing_connector',
    });
  });

  it('validates data_product and domain refs', () => {
    const compiled: CompiledWorkflow = {
      name: 'test_wf',
      ops: [],
      referencedResources: [
        { type: 'data_product', id: 'dp_1' },
        { type: 'domain', id: 'dm_missing' },
      ],
    };
    const result = validateReferencedResources(
      [{ compiled, file: 'dp-workflow.ts' }],
      ctx
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'domain', id: 'dm_missing' });
  });

  it('validates workflow refs', () => {
    const compiled: CompiledWorkflow = {
      name: 'test_wf',
      ops: [],
      referencedResources: [
        { type: 'workflow', id: 'wf_1' },
        { type: 'workflow', id: 'wf_missing', name: 'gone' },
      ],
    };
    const result = validateReferencedResources(
      [{ compiled, file: 'wf-workflow.ts' }],
      ctx
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'workflow', id: 'wf_missing', name: 'gone' });
  });

  it('aggregates errors across multiple modules', () => {
    const compiled1: CompiledWorkflow = {
      name: 'wf1',
      ops: [],
      referencedResources: [{ type: 'queue', id: 'q_bad' }],
    };
    const compiled2: CompiledWorkflow = {
      name: 'wf2',
      ops: [],
      referencedResources: [{ type: 'connector', id: 'cn_bad' }],
    };
    const result = validateReferencedResources(
      [
        { compiled: compiled1, file: 'wf1.ts' },
        { compiled: compiled2, file: 'wf2.ts' },
      ],
      ctx
    );
    expect(result).toHaveLength(2);
    expect(result[0].file).toBe('wf1.ts');
    expect(result[1].file).toBe('wf2.ts');
  });
});

// ─── discoverModuleFiles ─────────────────────────────────────────────────────

describe('discoverModuleFiles', () => {
  it('returns empty array when workflows/ does not exist', () => {
    const result = discoverModuleFiles('/tmp/nonexistent_project_' + Date.now());
    expect(result).toEqual([]);
  });

  it('lists .ts/.js modules and skips tests and .d.ts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-discover-'));
    try {
      const wf = join(dir, 'workflows');
      mkdirSync(wf, { recursive: true });
      writeFileSync(join(wf, 'main.js'), 'module.exports = {}');
      writeFileSync(join(wf, 'main.test.js'), '');
      writeFileSync(join(wf, 'types.d.ts'), '');
      writeFileSync(join(wf, 'other.ts'), '');
      writeFileSync(join(wf, 'readme.md'), '');
      const files = discoverModuleFiles(dir).map(f => f.filename).sort();
      expect(files).toEqual(['main.js', 'other.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── deployLocalEntityWorkflows ──────────────────────────────────────────────

describe('deployLocalEntityWorkflows', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'deploy-cmd-json-entity-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function writeLocalWorkflowPackage(workflowId: string): void {
    const root = join(projectDir, 'workflows', workflowId);
    mkdirSync(join(root, 'connections'), { recursive: true });
    writeFileSync(
      join(root, 'workflow.json'),
      JSON.stringify({ workflow_id: workflowId, name: 'SDK Ingest', workflow_type: 'ingestion' })
    );
    writeFileSync(
      join(root, 'connections', 'conn-1.json'),
      JSON.stringify({ connection_id: 'conn-1', key: 'sdk-input', type: 'sdk' })
    );
  }

  function makeClient(handlers: {
    bundleOk?: (workflowId: string) => boolean;
    reindexCalled: { count: number };
    deployCalled: { count: number };
  }): LoxtepClient {
    return new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'test-token' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string | URL | Request, init?: RequestInit) => {
        const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

        if (u.includes('/workflow-bundle')) {
          const body = init?.body ? (JSON.parse(String(init.body)) as { files?: Record<string, unknown> }) : {};
          const workflowJson = body.files?.['workflow.json'] as { workflow_id?: string } | undefined;
          const ok = handlers.bundleOk ? handlers.bundleOk(workflowJson?.workflow_id ?? '') : true;
          if (!ok) {
            return new Response(
              JSON.stringify({ success: false, error: { message: 'Bundle rejected' } }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({ success: true, data: { success: true, workflow_id: workflowJson?.workflow_id } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (u.includes('/reindex')) {
          handlers.reindexCalled.count += 1;
          return new Response(
            JSON.stringify({ success: true, data: { project_id: 'proj-1', enqueued: true } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (u.endsWith('/deploy')) {
          handlers.deployCalled.count += 1;
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                run_id: 'deploy-001',
                deployment_id: 'deploy-001',
                status: 'in_progress',
                message: 'Project deployment requested',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
  }

  it('returns empty pushed list and does not call reindex/deploy when no local workflows exist', async () => {
    const reindexCalled = { count: 0 };
    const deployCalled = { count: 0 };
    const client = makeClient({ reindexCalled, deployCalled });

    const result = await deployLocalEntityWorkflows(client, projectDir, 'proj-1', 'inst-1');

    expect(result.pushed).toEqual([]);
    expect(result.trackingHandle).toBeUndefined();
    expect(reindexCalled.count).toBe(0);
    expect(deployCalled.count).toBe(0);
  });

  it('pushes, reindexes once, and activates once for a local JSON-entity workflow package', async () => {
    writeLocalWorkflowPackage('wf-json-1');
    const reindexCalled = { count: 0 };
    const deployCalled = { count: 0 };
    const client = makeClient({ reindexCalled, deployCalled });

    const result = await deployLocalEntityWorkflows(client, projectDir, 'proj-1', 'inst-1');

    expect(result.pushed).toEqual([{ workflow_id: 'wf-json-1', ok: true }]);
    expect(reindexCalled.count).toBe(1);
    expect(deployCalled.count).toBe(1);
    expect(result.trackingHandle).toEqual({ run_id: 'deploy-001', status: 'in_progress' });
  });

  it('reports per-workflow push failures and skips reindex/deploy when all fail', async () => {
    writeLocalWorkflowPackage('wf-bad');
    const reindexCalled = { count: 0 };
    const deployCalled = { count: 0 };
    const client = makeClient({ bundleOk: () => false, reindexCalled, deployCalled });

    const result = await deployLocalEntityWorkflows(client, projectDir, 'proj-1', 'inst-1');

    expect(result.pushed).toEqual([
      { workflow_id: 'wf-bad', ok: false, error: expect.any(String) },
    ]);
    expect(reindexCalled.count).toBe(0);
    expect(deployCalled.count).toBe(0);
    expect(result.trackingHandle).toBeUndefined();
  });

  it('still reindexes and activates when at least one of multiple workflows pushes successfully', async () => {
    writeLocalWorkflowPackage('wf-good');
    writeLocalWorkflowPackage('wf-bad');
    const reindexCalled = { count: 0 };
    const deployCalled = { count: 0 };
    const client = makeClient({
      bundleOk: id => id === 'wf-good',
      reindexCalled,
      deployCalled,
    });

    const result = await deployLocalEntityWorkflows(client, projectDir, 'proj-1', 'inst-1');

    expect(result.pushed).toEqual(
      expect.arrayContaining([
        { workflow_id: 'wf-good', ok: true },
        { workflow_id: 'wf-bad', ok: false, error: expect.any(String) },
      ])
    );
    expect(reindexCalled.count).toBe(1);
    expect(deployCalled.count).toBe(1);
  });

  it('treats reindex failure as non-fatal and still activates', async () => {
    writeLocalWorkflowPackage('wf-json-1');
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'test-token' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string | URL | Request) => {
        const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (u.includes('/workflow-bundle')) {
          return new Response(
            JSON.stringify({ success: true, data: { success: true, workflow_id: 'wf-json-1' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (u.includes('/reindex')) {
          return new Response(JSON.stringify({ success: false, error: { message: 'busy' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (u.endsWith('/deploy')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: { deployment_id: 'dep-only', message: 'queued' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });

    const result = await deployLocalEntityWorkflows(client, projectDir, 'proj-1', 'inst-1');
    expect(result.pushed[0]?.ok).toBe(true);
    expect(result.trackingHandle?.run_id).toBe('dep-only');
    expect(result.trackingHandle?.status).toMatch(/queued|unknown|in_progress|failed/);
  });

  it('records failed tracking handle when activate deploy throws', async () => {
    writeLocalWorkflowPackage('wf-json-1');
    const client = new LoxtepClient({
      url_resolution: 'legacy',
      api_url: 'https://api.example.com',
      auth: { type: 'jwt', token: 'test-token' },
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: async (url: string | URL | Request) => {
        const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (u.includes('/workflow-bundle')) {
          return new Response(
            JSON.stringify({ success: true, data: { success: true, workflow_id: 'wf-json-1' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (u.includes('/reindex')) {
          return new Response(
            JSON.stringify({ success: true, data: { project_id: 'proj-1', enqueued: true } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (u.endsWith('/deploy')) {
          return new Response(JSON.stringify({ success: false, error: { message: 'boom' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });

    const result = await deployLocalEntityWorkflows(client, projectDir, 'proj-1', 'inst-1');
    expect(result.trackingHandle?.run_id).toBe('unknown');
    expect(result.trackingHandle?.status).toMatch(/failed:/);
  });
});

// ─── runDeployCommand preconditions / dry_run ────────────────────────────────

describe('runDeployCommand', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'deploy-cmd-run-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('fails when no .loxtep/project.json exists', async () => {
    const result = await runDeployCommand({ cwd: projectDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toMatch(/loxtep init|project\.json/i);
  });

  function writeAttachedProject(extra: Record<string, unknown> = {}): void {
    mkdirSync(join(projectDir, '.loxtep'), { recursive: true });
    mkdirSync(join(projectDir, 'workflows'), { recursive: true });
    writeFileSync(
      join(projectDir, '.loxtep', 'project.json'),
      JSON.stringify({
        project_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        instance_id: '44444444-4444-4444-8444-444444444444',
        api_url: 'https://api.test.loxtep.com',
        // deploy requires requireAttachedStreamConfig (instance_id + api_url + streams).
        streams: {
          Region: 'us-east-1',
          LeoEvent: 'LeoEvent',
          LeoStream: 'LeoStream',
          LeoCron: 'LeoCron',
          LeoS3: 'LeoS3',
          LeoKinesisStream: 'LeoKinesis',
          LeoFirehoseStream: 'LeoFirehose',
          LeoSettings: 'LeoSettings',
        },
        ...extra,
      }),
      'utf-8'
    );
  }

  it('dry_run returns lint-only success for an attached empty project', async () => {
    writeAttachedProject();
    const result = await runDeployCommand({ cwd: projectDir, dry_run: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join('\n')).toContain('Deploy dry-run');
    expect(result.stdout.join('\n')).toMatch(/Lint skipped|Lint passed/);
  });

  it('fails when project is not attached', async () => {
    mkdirSync(join(projectDir, '.loxtep'), { recursive: true });
    writeFileSync(
      join(projectDir, '.loxtep', 'project.json'),
      JSON.stringify({ project_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
      'utf-8'
    );
    const result = await runDeployCommand({ cwd: projectDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toMatch(/attach/i);
  });

  it('reports nothing to deploy when workflows/ is empty', async () => {
    const { createLocalProjectHarness } = await import('../__tests__/cli-test-harness.js');
    const harness = await createLocalProjectHarness();
    try {
      const result = await runDeployCommand({
        cwd: harness.projectDir,
        cliOptions: harness.cliOptions,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toContain('Nothing to deploy');
    } finally {
      await harness.destroy();
    }
  });

  it('rejects invalid compiled modules with file:line errors', async () => {
    const { createLocalProjectHarness } = await import('../__tests__/cli-test-harness.js');
    const harness = await createLocalProjectHarness();
    try {
      writeFileSync(
        join(harness.projectDir, 'workflows', 'broken.js'),
        'module.exports = { name: "broken" };\n'
      );
      const result = await runDeployCommand({
        cwd: harness.projectDir,
        cliOptions: harness.cliOptions,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toContain('compilation errors');
      expect(result.stderr.join('\n')).toContain('broken.js');
    } finally {
      await harness.destroy();
    }
  });

  it('fails when workspace context cannot be loaded', async () => {
    const { createLocalProjectHarness } = await import('../__tests__/cli-test-harness.js');
    const harness = await createLocalProjectHarness();
    try {
      const result = await runDeployCommand({
        cwd: harness.projectDir,
        cliOptions: {
          ...harness.cliOptions,
          fetch_fn: async () =>
            new Response(JSON.stringify({ success: false, error: { message: 'context down' } }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }),
        },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toMatch(/workspace context|Deploy failed/i);
    } finally {
      await harness.destroy();
    }
  });

  it('runDeploy prints stdout/stderr and sets exitCode', async () => {
    const { runDeploy } = await import('./deploy-cmd.js');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const prev = process.exitCode;
    try {
      await runDeploy();
      expect(process.exitCode).toBe(1);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      process.exitCode = prev;
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('refuses deploy when local entity package fails lint', async () => {
    writeAttachedProject();
    const wfRoot = join(projectDir, 'workflows', 'wf-bad');
    mkdirSync(join(wfRoot, 'connections'), { recursive: true });
    // Parseable JSON that fails schema / relationship lint (connection missing connector_id).
    writeFileSync(
      join(wfRoot, 'workflow.json'),
      JSON.stringify({
        workflow_id: 'wf-bad',
        name: 'Bad',
        workflow_type: 'ingestion',
      })
    );
    writeFileSync(
      join(wfRoot, 'connections', 'conn-1.json'),
      JSON.stringify({ connection_id: 'conn-1', key: 'in', type: 'sdk' })
    );
    const result = await runDeployCommand({ cwd: projectDir, dry_run: true });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toMatch(/lint|Deploy refused|connector_id/i);
  });

  it('deploys repo-bound project via platform deploy endpoint', async () => {
    const {
      createLocalProjectHarness,
      writeMinimalWorkflowModule,
    } = await import('../__tests__/cli-test-harness.js');
    const harness = await createLocalProjectHarness();
    try {
      await writeMinimalWorkflowModule(harness.projectDir, 'echo-bound');
      const projectFile = join(harness.projectDir, '.loxtep', 'project.json');
      const cfg = JSON.parse(readFileSync(projectFile, 'utf-8')) as Record<string, unknown>;
      cfg.repository = {
        url: 'https://github.com/acme/demo.git',
        name: 'acme/demo',
        branch: 'main',
      };
      writeFileSync(projectFile, JSON.stringify(cfg, null, 2));

      const result = await runDeployCommand({
        cwd: harness.projectDir,
        cliOptions: harness.cliOptions,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toMatch(/Deploy target|S3 Code_Bundle|Created|Updated/);
    } finally {
      await harness.destroy();
    }
  });

  it('rejects missing referenced resources on the instance', async () => {
    const { createLocalProjectHarness } = await import('../__tests__/cli-test-harness.js');
    const { createPlatformMockFetch } = await import('../__tests__/mock-platform-api.js');
    const harness = await createLocalProjectHarness();
    try {
      writeFileSync(
        join(harness.projectDir, 'workflows', 'missing-queue.js'),
        `const workflow = {
  name: 'missing-queue-wf',
  triggers: [{ kind: 'queue', ref: { id: 'q_does_not_exist', name: 'ghost' } }],
  async handler() {},
};
module.exports = workflow;
module.exports.default = workflow;
`
      );
      const result = await runDeployCommand({
        cwd: harness.projectDir,
        cliOptions: harness.cliOptions,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toMatch(/referenced resources not found|q_does_not_exist/);
    } finally {
      await harness.destroy();
    }
  });

  it('reports failed local entity package push via runDeployCommand', async () => {
    const { createLocalProjectHarness } = await import('../__tests__/cli-test-harness.js');
    const { createPlatformMockFetch, MOCK_IDS } = await import('../__tests__/mock-platform-api.js');
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && pathname.includes('/workflow-bundle')) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'push boom' } }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      // Valid schema-shaped package so lint passes and we reach save_workflow_bundle.
      const out = captureCliOutput();
      await runIngestCreate(
        {
          name: 'app-events',
          domain_id: MOCK_IDS.domain_id,
          dry_run: false,
        },
        harness.cliOptions
      );
      out.restore();
      process.exitCode = 0;

      const result = await runDeployCommand({
        cwd: harness.projectDir,
        cliOptions: { ...harness.cliOptions, fetch_fn: fetchFn },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toMatch(/failed to push/i);
    } finally {
      await harness.destroy();
    }
  });

  it('reports failed workflow removal and failed individual deploys', async () => {
    const {
      createLocalProjectHarness,
      writeMinimalWorkflowModule,
    } = await import('../__tests__/cli-test-harness.js');
    const { createPlatformMockFetch } = await import('../__tests__/mock-platform-api.js');
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'DELETE' && /\/workflows\/projects\/[^/?]+$/.test(pathname.split('?')[0] ?? '')) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'delete denied' } }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (method === 'POST' && pathname.includes('/workflows/workflows')) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'create failed' } }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      await writeMinimalWorkflowModule(harness.projectDir, 'echo-local');
      const result = await runDeployCommand({
        cwd: harness.projectDir,
        cliOptions: { ...harness.cliOptions, fetch_fn: fetchFn },
      });
      // Non-repo path: create may fail → failed deploy; removals may fail → Failed to remove
      expect(result.exitCode).toBe(1);
      const text = `${result.stdout.join('\n')}\n${result.stderr.join('\n')}`;
      expect(text).toMatch(/failed to deploy|Failed to remove|create failed|delete denied/i);
    } finally {
      await harness.destroy();
    }
  });

  it('fails repo-bound deploy when platform deploy endpoint errors', async () => {
    const {
      createLocalProjectHarness,
      writeMinimalWorkflowModule,
    } = await import('../__tests__/cli-test-harness.js');
    const { createPlatformMockFetch } = await import('../__tests__/mock-platform-api.js');
    const harness = await createLocalProjectHarness();
    const fetchFn = createPlatformMockFetch({
      extra: (pathname, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && pathname.includes('/deploy')) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'deploy unavailable' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      },
    });
    try {
      await writeMinimalWorkflowModule(harness.projectDir, 'echo-bound');
      const projectFile = join(harness.projectDir, '.loxtep', 'project.json');
      const cfg = JSON.parse(readFileSync(projectFile, 'utf-8')) as Record<string, unknown>;
      cfg.repository = { url: 'https://github.com/acme/demo.git', name: 'acme/demo', branch: 'main' };
      writeFileSync(projectFile, JSON.stringify(cfg, null, 2));
      const result = await runDeployCommand({
        cwd: harness.projectDir,
        cliOptions: { ...harness.cliOptions, fetch_fn: fetchFn },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toMatch(/Deploy failed/);
    } finally {
      await harness.destroy();
    }
  });
});
