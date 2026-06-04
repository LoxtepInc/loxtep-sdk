/**
 * Feature: ai-first-platform-surface
 * Property 1: Templated scaffold completeness
 *
 * For any valid template slug, `runInitCommand` with `--template <slug>` produces
 * a directory containing:
 *   - `.loxtep/project.json` (with `template_slug` set to the slug)
 *   - `AGENTS.md` (referencing the slug)
 *   - `.loxtep/skills/<slug>.yaml` (valid YAML with the skill name matching the slug)
 *   - All standard directories: `domains/`, `connectors/`, `workflows/`, `data-products/`
 *
 * **Validates: Requirements 1.2, 16.1, 16.2**
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
 * Arbitrary valid template slug: lowercase alphanumeric with hyphens,
 * 2-30 chars, no leading/trailing hyphens, no consecutive hyphens.
 * This models realistic template slugs from the catalog.
 */
const templateSlugArb = fc
  .stringMatching(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/)
  .filter((s) => s.length >= 2 && s.length <= 30);

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

  it(
    'For any valid template slug, runInitCommand with --template produces a complete scaffold ' +
      'containing .loxtep/project.json (with template_slug), AGENTS.md (referencing the slug), ' +
      '.loxtep/skills/<slug>.yaml (valid YAML with matching skill name), and all standard directories',
    async () => {
      await fc.assert(
        fc.asyncProperty(templateSlugArb, async (slug) => {
          const tmpDir = await createTmpDir();
          tmpDirs.push(tmpDir);

          // Run init with --template (no client — local-only scaffold)
          const result = await runInitCommand({
            cwd: tmpDir,
            templateSlug: slug,
          });

          // Command should succeed
          expect(result.exitCode).toBe(0);

          // ── R1.2: .loxtep/project.json exists with template_slug ──
          const projectJsonPath = join(tmpDir, '.loxtep', 'project.json');
          expect(existsSync(projectJsonPath)).toBe(true);
          const projectJson = JSON.parse(readFileSync(projectJsonPath, 'utf-8'));
          expect(projectJson.template_slug).toBe(slug);
          expect(typeof projectJson.project_id).toBe('string');
          expect(projectJson.project_id.length).toBeGreaterThan(0);

          // ── R16.1: AGENTS.md exists and references the template slug ──
          const agentsMdPath = join(tmpDir, 'AGENTS.md');
          expect(existsSync(agentsMdPath)).toBe(true);
          const agentsMdContent = readFileSync(agentsMdPath, 'utf-8');
          expect(agentsMdContent).toContain(slug);

          // ── R16.2: .loxtep/skills/<slug>.yaml exists, is valid YAML, name matches ──
          const skillYamlPath = join(tmpDir, '.loxtep', 'skills', `${slug}.yaml`);
          expect(existsSync(skillYamlPath)).toBe(true);
          const skillContent = readFileSync(skillYamlPath, 'utf-8');
          const skillParsed = yaml.load(skillContent) as Record<string, unknown>;
          expect(skillParsed).toBeDefined();
          expect(skillParsed.name).toBe(slug);

          // ── R1.2: All standard directories exist ──
          const standardDirs = ['domains', 'connectors', 'workflows', 'data-products'];
          for (const dir of standardDirs) {
            expect(existsSync(join(tmpDir, dir))).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );
});
