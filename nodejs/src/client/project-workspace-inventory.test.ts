/**
 * Fixture tests: unpublished inventory dirty vs clean against push-manifest.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildLocalToCloudInventory,
  buildCloudToDeployedInventory,
  discoverLocalPackageFiles,
  writePushManifestFromProjectDir,
} from './project-workspace-inventory.js';
import { buildProjectWorkspaceStatus } from './project-workspace-status.js';

function writeFixtureWorkspace(root: string): void {
  mkdirSync(join(root, '.loxtep'), { recursive: true });
  writeFileSync(
    join(root, '.loxtep', 'project.json'),
    JSON.stringify({
      project_id: '11111111-1111-1111-1111-111111111111',
      instance_id: '22222222-2222-2222-2222-222222222222',
      api_url: 'https://apidev.loxtep.io',
    }),
    'utf8'
  );
  const wf = join(root, 'workflows', 'wf_orders');
  mkdirSync(join(wf, 'connections'), { recursive: true });
  mkdirSync(join(wf, 'data-products'), { recursive: true });
  writeFileSync(
    join(wf, 'workflow.json'),
    JSON.stringify({
      workflow_id: 'wf_orders',
      name: 'orders',
      workflow_type: 'ingestion',
    }),
    'utf8'
  );
  writeFileSync(
    join(wf, 'connections', 'shopify.json'),
    JSON.stringify({ connection_id: 'conn_1', name: 'shopify', connector_id: 'c1' }),
    'utf8'
  );
  writeFileSync(
    join(wf, 'data-products', 'orders.json'),
    JSON.stringify({ data_product_id: 'dp_1', name: 'orders' }),
    'utf8'
  );
  mkdirSync(join(root, 'schemas'), { recursive: true });
  writeFileSync(
    join(root, 'schemas', 'order.json'),
    JSON.stringify({ type: 'object', properties: { id: { type: 'string' } } }),
    'utf8'
  );
}

describe('project-workspace-inventory', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loxtep-inv-'));
    writeFixtureWorkspace(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('discovers push package paths (workflows, connections, data products, schemas)', () => {
    const files = discoverLocalPackageFiles(dir);
    const paths = files.map(f => f.path);
    expect(paths).toContain('workflows/wf_orders/workflow.json');
    expect(paths).toContain('workflows/wf_orders/connections/shopify.json');
    expect(paths).toContain('workflows/wf_orders/data-products/orders.json');
    expect(paths).toContain('schemas/order.json');
    expect(files.find(f => f.path.includes('connections'))?.entity_kind).toBe('connection');
    expect(files.find(f => f.path.includes('data-products'))?.entity_kind).toBe('data_product');
    expect(files.find(f => f.path.startsWith('schemas/'))?.entity_kind).toBe('schema');
  });

  it('marks dirty when no push manifest (pending_push inventory)', () => {
    const inv = buildLocalToCloudInventory({ projectDir: dir });
    expect(inv.dirty).toBe(true);
    expect(inv.changed_count).toBeGreaterThan(0);
    expect(inv.changes.every(c => c.change === 'pending_push')).toBe(true);
    expect(inv.summary).toMatch(/no local push manifest/i);
  });

  it('marks clean when local matches written push manifest', () => {
    writePushManifestFromProjectDir(dir, '11111111-1111-1111-1111-111111111111');
    const inv = buildLocalToCloudInventory({ projectDir: dir });
    expect(inv.dirty).toBe(false);
    expect(inv.changed_count).toBe(0);
    expect(inv.changes).toEqual([]);
    expect(inv.summary).toMatch(/matches last push/i);
  });

  it('marks modified after local edit vs push manifest', () => {
    writePushManifestFromProjectDir(dir, '11111111-1111-1111-1111-111111111111');
    const connPath = join(dir, 'workflows', 'wf_orders', 'connections', 'shopify.json');
    const before = JSON.parse(readFileSync(connPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(connPath, JSON.stringify({ ...before, name: 'shopify-v2' }), 'utf8');

    const inv = buildLocalToCloudInventory({ projectDir: dir });
    expect(inv.dirty).toBe(true);
    expect(inv.changes.some(c => c.change === 'modified' && c.path.includes('shopify.json'))).toBe(
      true
    );
  });

  it('escalates cloud_only when cloud workflow ids include extras', () => {
    writePushManifestFromProjectDir(dir, '11111111-1111-1111-1111-111111111111');
    const inv = buildLocalToCloudInventory({
      projectDir: dir,
      cloud_workflow_ids: ['wf_orders', 'wf_remote_only'],
    });
    expect(inv.dirty).toBe(true);
    expect(inv.changes.some(c => c.change === 'cloud_only' && c.workflow_id === 'wf_remote_only')).toBe(
      true
    );
  });

  it('builds Cloud→Deployed pending_deploy inventory when never deployed', () => {
    writePushManifestFromProjectDir(dir, '11111111-1111-1111-1111-111111111111');
    const l2c = buildLocalToCloudInventory({ projectDir: dir });
    const c2d = buildCloudToDeployedInventory({
      local_to_cloud: l2c,
      deployed_state: 'never_deployed',
      cloud_to_deployed_dirty: true,
      cloud_to_deployed_summary: 'Never deployed',
      projectDir: dir,
    });
    expect(c2d.dirty).toBe(true);
    expect(c2d.changed_count).toBeGreaterThan(0);
    expect(c2d.changes.every(c => c.change === 'pending_deploy')).toBe(true);
  });

  it('status --unpublished depth attaches file lists on ProjectWorkspaceStatus', () => {
    const status = buildProjectWorkspaceStatus({
      population_depth: 'unpublished',
      local: {
        project_id: '11111111-1111-1111-1111-111111111111',
        path: dir,
        project_file: join(dir, '.loxtep', 'project.json'),
        instance_id: '22222222-2222-2222-2222-222222222222',
        api_url: 'https://apidev.loxtep.io',
      },
      cloud: {
        project_id: '11111111-1111-1111-1111-111111111111',
        organization_id: '33333333-3333-3333-3333-333333333333',
        name: 'demo',
        status: 'active',
        is_active: true,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
      },
      deployments: [],
    });
    expect(status.population_depth).toBe('unpublished');
    expect(status.unpublished.local_to_cloud.dirty).toBe(true);
    expect(status.unpublished.local_to_cloud.changes.length).toBeGreaterThan(0);
    expect(status.unpublished.cloud_to_deployed.dirty).toBe(true);
    expect(status.unpublished.cloud_to_deployed.changes.length).toBeGreaterThan(0);
  });
});
