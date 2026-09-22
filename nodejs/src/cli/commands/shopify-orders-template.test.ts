/**
 * Unit tests for shopify-orders template materialization + setup command.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runInitCommand } from './init-cmd.js';
import { runSetupCommand } from './setup-cmd.js';
import { materializeBundledTemplate, listBundledTemplateSlugs } from '../templates-materialize.js';

describe('shopify-orders bundled template', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'loxtep-shopify-tpl-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('lists shopify-orders as a bundled slug', async () => {
    const slugs = await listBundledTemplateSlugs();
    expect(slugs).toContain('shopify-orders');
  });

  it('materializes workflow, event fixture, and skill', async () => {
    const result = await materializeBundledTemplate(tmpDir, 'shopify-orders');
    expect(result).not.toBeNull();
    expect(existsSync(join(tmpDir, 'workflows', 'orders-enricher.ts'))).toBe(true);
    expect(existsSync(join(tmpDir, 'events', 'order-created.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.loxtep', 'skills', 'shopify-orders.yaml'))).toBe(true);

    const wf = readFileSync(join(tmpDir, 'workflows', 'orders-enricher.ts'), 'utf-8');
    expect(wf).toContain("../.loxtep/generated");
    expect(wf).toContain("requireApproval: ['dataProducts.write']");
    expect(wf).not.toContain("queues.read");
    expect(wf).toContain('dataProducts.write');
  });

  it('init --template shopify-orders scaffolds the runnable sample (offline)', async () => {
    const result = await runInitCommand({
      cwd: tmpDir,
      templateSlug: 'shopify-orders',
      offline: true,
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'workflows', 'orders-enricher.ts'))).toBe(true);
    expect(existsSync(join(tmpDir, 'events', 'order-created.json'))).toBe(true);
    expect(result.stdout.join('\n')).toMatch(/setup|shopify-orders/i);
  });
});

describe('loxtep setup', () => {
  it('fails when no project is initialized', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'loxtep-setup-'));
    try {
      const result = await runSetupCommand({ cwd: dir });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toContain('loxtep init');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
