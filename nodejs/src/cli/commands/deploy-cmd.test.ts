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

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverModuleFiles,
  resolveDeployTarget,
  validateReferencedResources,
  deployLocalEntityWorkflows,
  type CompileError,
  type MissingRefError,
  type DeployTarget,
} from './deploy-cmd.js';
import { LoxtepClient } from '../../client/loxtep-client.js';
import type { CompiledWorkflow } from '../../authoring/compiler.js';
import type { NormalizedContext } from '../../codegen/types.js';
import type { Instance } from '../../client/instances-types.js';

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
});
