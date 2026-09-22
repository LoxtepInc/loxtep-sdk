/**
 * Shared loader for code-first workflow modules under `workflows/`.
 *
 * Loads `.ts` via `tsx` (bundled dependency) and surfaces real import errors
 * instead of collapsing every failure into "module not found".
 */

import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DataWorkflowModule } from '../authoring/types.js';

export interface LoadWorkflowModuleResult {
  module: DataWorkflowModule | null;
  /** Absolute path that successfully loaded, if any. */
  loadedFrom?: string;
  /** Per-candidate load failures (path → error message). */
  errors: Array<{ path: string; message: string }>;
}

let tsxRegistered = false;

/**
 * Register the tsx ESM loader once so dynamic `import()` can load TypeScript.
 */
async function ensureTsxLoader(): Promise<void> {
  if (tsxRegistered) return;
  try {
    const tsxApi = await import('tsx/esm/api');
    if (typeof tsxApi.register === 'function') {
      tsxApi.register();
    }
    tsxRegistered = true;
  } catch (err) {
    // Leave tsxRegistered false so callers can report why .ts failed.
    throw new Error(
      `TypeScript workflow modules require the "tsx" package (bundled with @loxtep/sdk). ` +
        `Failed to register loader: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function isDataWorkflowModule(value: unknown): value is DataWorkflowModule {
  if (!value || typeof value !== 'object') return false;
  const mod = value as Record<string, unknown>;
  return typeof mod.handler === 'function' && typeof mod.name === 'string' && mod.name.length > 0;
}

/**
 * Extract a DataWorkflowModule from a dynamic-import namespace.
 */
export function extractWorkflowModule(mod: unknown): DataWorkflowModule | null {
  if (!mod || typeof mod !== 'object') return null;
  const ns = mod as Record<string, unknown>;
  const candidates = [ns.default, ns.workflow, ns];
  for (const c of candidates) {
    if (isDataWorkflowModule(c)) return c;
  }
  return null;
}

/**
 * Dynamically import a single workflow file. Registers tsx for `.ts` sources.
 */
export async function importWorkflowFile(filePath: string): Promise<DataWorkflowModule> {
  if (extname(filePath) === '.ts') {
    await ensureTsxLoader();
  }
  const href = pathToFileURL(filePath).href;
  const mod = await import(href);
  const workflow = extractWorkflowModule(mod);
  if (!workflow) {
    throw new Error(
      `File does not export a DataWorkflowModule (expected default export with name + handler): ${filePath}`
    );
  }
  return workflow;
}

/**
 * Load a named workflow module from `workflows/<name>.{ts,js}`.
 */
export async function loadWorkflowModuleByName(
  projectDir: string,
  moduleName: string
): Promise<LoadWorkflowModuleResult> {
  const workflowsDir = join(projectDir, 'workflows');
  const candidates = [
    join(workflowsDir, `${moduleName}.ts`),
    join(workflowsDir, `${moduleName}.js`),
    join(workflowsDir, `${moduleName}.mjs`),
    join(workflowsDir, moduleName),
  ];

  const errors: LoadWorkflowModuleResult['errors'] = [];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const workflow = await importWorkflowFile(candidate);
      return { module: workflow, loadedFrom: candidate, errors };
    } catch (err) {
      errors.push({
        path: candidate,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { module: null, errors };
}
