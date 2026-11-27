/**
 * Feature: ai-first-platform-surface
 * Property 1: Templated scaffold completeness (bundled only)
 *
 * For the bundled `shopify-orders` slug, `runInitCommand` with `--template`
 * produces a directory containing:
 *   - `.loxtep/project.json` (with `template_slug` set to the slug)
 *   - `AGENTS.md` (referencing the slug)
 *   - `.loxtep/skills/<slug>.yaml` (valid YAML with the skill name matching the slug)
 *   - All standard directories: `domains/`, `connectors/`, `workflows/`, `data-products/`
 *   - Workflow sources from the bundled template
 *
 * Non-bundled / catalog slugs exit non-zero and write no stub (#88).
 *
 * **Validates: Requirements 1.2, 16.1, 16.2 + issue #88**
 */

import fc from 'fast-check';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as yaml from 'js-yaml';
import { runInitCommand } from './init-cmd.js';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Arbitrary catalog-style slug that is NOT the bundled shopify-orders template.
 */
const nonBundledSlugArb = fc
  .stringMatching(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/)
  .filter((s) => s.length >= 2 && s.length <= 30 && s !== 'shopify-orders');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'loxtep-pbt-init-'));
}

// ─── Property Test ────────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 1: Templated scaffold completeness', () => {
  const tmpDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it('bundled shopify-orders produces a complete scaffold', async () => {
    const tmpDir = await createTmpDir();
    tmpDirs.push(tmpDir);

    const result = await runInitCommand({
      cwd: tmpDir,
      templateSlug: 'shopify-orders',
      offline: true,
    });

    expect(result.exitCode).toBe(0);

    const projectJsonPath = join(tmpDir, '.loxtep', 'project.json');
    expect(existsSync(projectJsonPath)).toBe(true);
    const projectJson = JSON.parse(readFileSync(projectJsonPath, 'utf-8'));
    expect(projectJson.template_slug).toBe('shopify-orders');

    const agentsMdPath = join(tmpDir, 'AGENTS.md');
    expect(existsSync(agentsMdPath)).toBe(true);
    expect(readFileSync(agentsMdPath, 'utf-8')).toContain('shopify-orders');

    const skillYamlPath = join(tmpDir, '.loxtep', 'skills', 'shopify-orders.yaml');
    expect(existsSync(skillYamlPath)).toBe(true);
    const skillParsed = yaml.load(readFileSync(skillYamlPath, 'utf-8')) as Record<string, unknown>;
    expect(skillParsed.name).toBe('shopify-orders');

    expect(existsSync(join(tmpDir, 'workflows', 'orders-enricher.ts'))).toBe(true);

    for (const dir of ['domains', 'connectors', 'workflows', 'data-products']) {
      expect(existsSync(join(tmpDir, dir))).toBe(true);
    }
  });

  it(
    'For any non-bundled catalog slug, init --template exits non-zero and writes no stub',
    async () => {
      await fc.assert(
        fc.asyncProperty(nonBundledSlugArb, async (slug) => {
          const tmpDir = await createTmpDir();
          tmpDirs.push(tmpDir);

          const result = await runInitCommand({
            cwd: tmpDir,
            templateSlug: slug,
            offline: true,
          });

          expect(result.exitCode).toBe(1);
          expect(result.stderr.join('\n')).toMatch(/not bundled/i);
          expect(existsSync(join(tmpDir, 'AGENTS.md'))).toBe(false);
          expect(existsSync(join(tmpDir, '.loxtep', 'skills', `${slug}.yaml`))).toBe(false);
          expect(existsSync(join(tmpDir, '.loxtep', 'project.json'))).toBe(false);
        }),
        { numRuns: 50 }
      );
    },
    60_000
  );
});
