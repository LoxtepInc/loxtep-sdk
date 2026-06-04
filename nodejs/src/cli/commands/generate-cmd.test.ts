/**
 * Unit tests for `loxtep generate` command wiring.
 *
 * Tests cover:
 * - Precondition guards (R1.7, R1.10)
 * - Context-retrieval failure exits non-zero, leaves artifact unchanged (R2.8)
 * - Successful generation prints per-type counts (R2.7)
 * - Skill validation failure exits non-zero (R5.8, R5.9)
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { runGenerateCommand } from './generate-cmd.js';

// Mock dependencies
jest.mock('../create-cli-client.js');
jest.mock('../../codegen/load-workspace-context.js');

import { requireCliClient } from '../create-cli-client.js';
import { loadWorkspaceContext } from '../../codegen/load-workspace-context.js';

const mockRequireCliClient = requireCliClient as jest.MockedFunction<typeof requireCliClient>;
const mockLoadWorkspaceContext = loadWorkspaceContext as jest.MockedFunction<typeof loadWorkspaceContext>;

function createTempDir(): string {
  const dir = join(tmpdir(), `loxtep-generate-test-${randomBytes(8).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createProjectDir(tmpDir: string, config: Record<string, unknown>): string {
  const loxtepDir = join(tmpDir, '.loxtep');
  mkdirSync(loxtepDir, { recursive: true });
  writeFileSync(join(loxtepDir, 'project.json'), JSON.stringify(config, null, 2));
  return tmpDir;
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('loxtep generate command', () => {
  describe('precondition guards', () => {
    it('R1.7: exits non-zero when no .loxtep/project.json exists', async () => {
      const tmpDir = createTempDir();
      try {
        const result = await runGenerateCommand(tmpDir);
        expect(result.exitCode).toBe(1);
        expect(result.stderr.join(' ')).toContain('loxtep init');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('R1.10: exits non-zero when project is not attached (no instance_id/api_url)', async () => {
      const tmpDir = createTempDir();
      try {
        createProjectDir(tmpDir, { project_id: 'proj_123' });
        const result = await runGenerateCommand(tmpDir);
        expect(result.exitCode).toBe(1);
        expect(result.stderr.join(' ')).toContain('loxtep attach');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('context-retrieval failure (R2.8)', () => {
    it('exits non-zero and prints error on context-retrieval failure', async () => {
      const tmpDir = createTempDir();
      try {
        createProjectDir(tmpDir, {
          project_id: 'proj_123',
          instance_id: 'inst_456',
          api_url: 'https://api.loxtep.io',
        });

        mockRequireCliClient.mockResolvedValue({
          client: {} as any,
          config: {} as any,
        });
        mockLoadWorkspaceContext.mockRejectedValue(new Error('Network timeout'));

        const result = await runGenerateCommand(tmpDir);
        expect(result.exitCode).toBe(1);
        expect(result.stderr.join(' ')).toContain('Failed to retrieve workspace context');
        expect(result.stderr.join(' ')).toContain('Network timeout');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('leaves prior artifact unchanged on context-retrieval failure', async () => {
      const tmpDir = createTempDir();
      try {
        createProjectDir(tmpDir, {
          project_id: 'proj_123',
          instance_id: 'inst_456',
          api_url: 'https://api.loxtep.io',
        });

        // Write a prior artifact
        const generatedDir = join(tmpDir, '.loxtep', 'generated');
        mkdirSync(generatedDir, { recursive: true });
        const artifactPath = join(generatedDir, 'index.ts');
        const priorContent = '// prior artifact content\n';
        writeFileSync(artifactPath, priorContent);

        mockRequireCliClient.mockResolvedValue({
          client: {} as any,
          config: {} as any,
        });
        mockLoadWorkspaceContext.mockRejectedValue(new Error('API unavailable'));

        await runGenerateCommand(tmpDir);

        // Verify prior artifact is unchanged
        expect(readFileSync(artifactPath, 'utf-8')).toBe(priorContent);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('successful generation (R2.7)', () => {
    it('prints per-type counts on success', async () => {
      const tmpDir = createTempDir();
      try {
        createProjectDir(tmpDir, {
          project_id: 'proj_123',
          instance_id: 'inst_456',
          api_url: 'https://api.loxtep.io',
        });

        mockRequireCliClient.mockResolvedValue({
          client: {} as any,
          config: {} as any,
        });
        mockLoadWorkspaceContext.mockResolvedValue({
          dataProducts: [
            { name: 'orders', id: 'dp_1', domain: 'commerce', schema: null },
            { name: 'customers', id: 'dp_2', domain: 'commerce', schema: null },
          ],
          connectors: [
            { type: 'shopify', id: 'cn_1', connection_id: 'conn_1', name: 'shopify_main' },
          ],
          domains: [
            { name: 'commerce', id: 'dm_1', data_product_ids: ['dp_1', 'dp_2'] },
          ],
          queues: [
            { name: 'orders_raw', id: 'q_1' },
          ],
          flows: [],
          workflows: [
            { name: 'order-sync', id: 'wf_1' },
          ],
        });

        const result = await runGenerateCommand(tmpDir);
        expect(result.exitCode).toBe(0);

        const output = result.stdout.join('\n');
        expect(output).toContain('Data products: 2');
        expect(output).toContain('Connectors:    1');
        expect(output).toContain('Domains:       1');
        expect(output).toContain('Queues:        1');
        expect(output).toContain('Flows:         0');
        expect(output).toContain('Workflows:     1');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('generates the artifact file at .loxtep/generated/index.ts', async () => {
      const tmpDir = createTempDir();
      try {
        createProjectDir(tmpDir, {
          project_id: 'proj_123',
          instance_id: 'inst_456',
          api_url: 'https://api.loxtep.io',
        });

        mockRequireCliClient.mockResolvedValue({
          client: {} as any,
          config: {} as any,
        });
        mockLoadWorkspaceContext.mockResolvedValue({
          dataProducts: [],
          connectors: [],
          domains: [],
          queues: [],
          flows: [],
          workflows: [],
        });

        const result = await runGenerateCommand(tmpDir);
        expect(result.exitCode).toBe(0);

        const artifactPath = join(tmpDir, '.loxtep', 'generated', 'index.ts');
        expect(existsSync(artifactPath)).toBe(true);

        const content = readFileSync(artifactPath, 'utf-8');
        expect(content).toContain('AUTO-GENERATED');
        expect(content).toContain('workspace');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('reports 0 for empty resource types (R2.7)', async () => {
      const tmpDir = createTempDir();
      try {
        createProjectDir(tmpDir, {
          project_id: 'proj_123',
          instance_id: 'inst_456',
          api_url: 'https://api.loxtep.io',
        });

        mockRequireCliClient.mockResolvedValue({
          client: {} as any,
          config: {} as any,
        });
        mockLoadWorkspaceContext.mockResolvedValue({
          dataProducts: [],
          connectors: [],
          domains: [],
          queues: [],
          flows: [],
          workflows: [],
        });

        const result = await runGenerateCommand(tmpDir);
        expect(result.exitCode).toBe(0);

        const output = result.stdout.join('\n');
        expect(output).toContain('Data products: 0');
        expect(output).toContain('Connectors:    0');
        expect(output).toContain('Domains:       0');
        expect(output).toContain('Queues:        0');
        expect(output).toContain('Flows:         0');
        expect(output).toContain('Workflows:     0');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('skill validation (R5.8, R5.9)', () => {
    it('exits non-zero when a skill references a non-existent resource', async () => {
      const tmpDir = createTempDir();
      try {
        createProjectDir(tmpDir, {
          project_id: 'proj_123',
          instance_id: 'inst_456',
          api_url: 'https://api.loxtep.io',
        });

        // Create a skill that references a non-existent data product
        const skillsDir = join(tmpDir, '.loxtep', 'skills');
        mkdirSync(skillsDir, { recursive: true });
        writeFileSync(
          join(skillsDir, 'analytics.yaml'),
          `name: analytics
description: Analytics skill
scope:
  data_products:
    - orders
    - nonexistent_product
permissions:
  data_products:
    - read
`
        );

        mockRequireCliClient.mockResolvedValue({
          client: {} as any,
          config: {} as any,
        });
        mockLoadWorkspaceContext.mockResolvedValue({
          dataProducts: [
            { name: 'orders', id: 'dp_1', domain: 'commerce', schema: null },
          ],
          connectors: [],
          domains: [],
          queues: [],
          flows: [],
          workflows: [],
        });

        const result = await runGenerateCommand(tmpDir);
        expect(result.exitCode).toBe(1);
        expect(result.stderr.join('\n')).toContain('Skill validation failed');
        expect(result.stderr.join('\n')).toContain('analytics');
        expect(result.stderr.join('\n')).toContain('nonexistent_product');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('succeeds when all skill references are valid', async () => {
      const tmpDir = createTempDir();
      try {
        createProjectDir(tmpDir, {
          project_id: 'proj_123',
          instance_id: 'inst_456',
          api_url: 'https://api.loxtep.io',
        });

        // Create a skill that references existing resources
        const skillsDir = join(tmpDir, '.loxtep', 'skills');
        mkdirSync(skillsDir, { recursive: true });
        writeFileSync(
          join(skillsDir, 'analytics.yaml'),
          `name: analytics
description: Analytics skill
scope:
  data_products:
    - orders
permissions:
  data_products:
    - read
`
        );

        mockRequireCliClient.mockResolvedValue({
          client: {} as any,
          config: {} as any,
        });
        mockLoadWorkspaceContext.mockResolvedValue({
          dataProducts: [
            { name: 'orders', id: 'dp_1', domain: 'commerce', schema: null },
          ],
          connectors: [],
          domains: [],
          queues: [],
          flows: [],
          workflows: [],
        });

        const result = await runGenerateCommand(tmpDir);
        expect(result.exitCode).toBe(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('succeeds when no skills directory exists', async () => {
      const tmpDir = createTempDir();
      try {
        createProjectDir(tmpDir, {
          project_id: 'proj_123',
          instance_id: 'inst_456',
          api_url: 'https://api.loxtep.io',
        });

        mockRequireCliClient.mockResolvedValue({
          client: {} as any,
          config: {} as any,
        });
        mockLoadWorkspaceContext.mockResolvedValue({
          dataProducts: [],
          connectors: [],
          domains: [],
          queues: [],
          flows: [],
          workflows: [],
        });

        const result = await runGenerateCommand(tmpDir);
        expect(result.exitCode).toBe(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
