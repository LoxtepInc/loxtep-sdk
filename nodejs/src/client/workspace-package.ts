/**
 * Shared local workspace package discovery (SDK-first entity-JSON layout).
 *
 * Same layout `loxtep push` / entity-package deploy use — do not invent a
 * second package model for unpublished inventory.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Find local workflow packages under `workflows/<id>/` (SDK-first entity-JSON
 * layout, as written by `ingest`/`transform`/`delivery create`) — as opposed to
 * the code-first-cli flow's flat `.ts`/`.js` module files.
 */
export function listLocalWorkflowIds(projectDir: string): string[] {
  const workflowsRoot = join(projectDir, 'workflows');
  if (!existsSync(workflowsRoot)) return [];
  return readdirSync(workflowsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(id => existsSync(join(workflowsRoot, id, 'workflow.json')));
}

/**
 * Collect the flat `save_workflow_bundle` files map for one workflow package.
 */
export function collectFlatBundle(
  projectDir: string,
  workflowId: string
): Record<string, Record<string, unknown>> {
  const root = join(projectDir, 'workflows', workflowId);
  const files: Record<string, Record<string, unknown>> = {};

  const workflowJson = JSON.parse(
    readFileSync(join(root, 'workflow.json'), 'utf8')
  ) as Record<string, unknown>;
  files['workflow.json'] = workflowJson;

  for (const entityDir of [
    'connections',
    'data-products',
    'transformations',
    'validations',
  ] as const) {
    const dir = join(root, entityDir);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const entity = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<
        string,
        unknown
      >;
      files[`${entityDir}/${name}`] = entity;
    }
  }

  return files;
}

/**
 * Code-first CLI modules: flat `.ts`/`.js` files directly under `workflows/`.
 * Deploy discovers these separately from entity-JSON packages.
 */
export function listLocalWorkflowModuleFiles(projectDir: string): string[] {
  const workflowsRoot = join(projectDir, 'workflows');
  if (!existsSync(workflowsRoot)) return [];
  return readdirSync(workflowsRoot, { withFileTypes: true })
    .filter(d => d.isFile() && (d.name.endsWith('.ts') || d.name.endsWith('.js')))
    .map(d => d.name)
    .sort();
}

/**
 * Project-level schema JSON files under `schemas/` (when present).
 */
export function listLocalSchemaPackageFiles(projectDir: string): string[] {
  const schemasRoot = join(projectDir, 'schemas');
  if (!existsSync(schemasRoot)) return [];
  return walkJsonFilesRelative(schemasRoot, 'schemas');
}

function walkJsonFilesRelative(absDir: string, relPrefix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    const rel = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...walkJsonFilesRelative(abs, rel));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(rel);
    }
  }
  return out.sort();
}
