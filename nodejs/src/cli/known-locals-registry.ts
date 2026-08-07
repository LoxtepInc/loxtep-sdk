/**
 * Known-locals registry: `~/.loxtep/workspaces.json` (LOX-1186 / Phase C).
 *
 * Tracks absolute workspace paths previously linked (or bound via `init --project-id`)
 * so `loxtep projects list --source local|remote|all` can merge local presence
 * without scanning the entire filesystem.
 *
 * Override the parent directory with `LOXTEP_CONFIG_DIR` (same as credentials/config).
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { getConfigDir } from '../config/paths.js';

export const WORKSPACES_REGISTRY_FILENAME = 'workspaces.json';
export const WORKSPACES_REGISTRY_SCHEMA_VERSION = 1 as const;

export const KnownLocalEntrySchema = z.object({
  path: z.string().min(1),
  project_id: z.string().min(1),
  last_seen_at: z.string().min(1),
});

export type KnownLocalEntry = z.infer<typeof KnownLocalEntrySchema>;

export const KnownLocalsRegistrySchema = z.object({
  schema_version: z.literal(WORKSPACES_REGISTRY_SCHEMA_VERSION),
  workspaces: z.array(KnownLocalEntrySchema),
});

export type KnownLocalsRegistry = z.infer<typeof KnownLocalsRegistrySchema>;

/** Absolute path to `~/.loxtep/workspaces.json` (or `LOXTEP_CONFIG_DIR`). */
export function getWorkspacesRegistryPath(): string {
  return join(getConfigDir(), WORKSPACES_REGISTRY_FILENAME);
}

function emptyRegistry(): KnownLocalsRegistry {
  return { schema_version: WORKSPACES_REGISTRY_SCHEMA_VERSION, workspaces: [] };
}

/**
 * Read the registry. Missing / unreadable / invalid files yield an empty registry
 * (callers can upsert without failing on first use).
 */
export function loadKnownLocalsRegistry(
  registryPath: string = getWorkspacesRegistryPath()
): KnownLocalsRegistry {
  if (!existsSync(registryPath)) {
    return emptyRegistry();
  }
  try {
    const raw = JSON.parse(readFileSync(registryPath, 'utf-8')) as unknown;
    const parsed = KnownLocalsRegistrySchema.safeParse(raw);
    return parsed.success ? parsed.data : emptyRegistry();
  } catch {
    return emptyRegistry();
  }
}

/** Atomic write (temp + rename) for the registry file. */
export async function saveKnownLocalsRegistry(
  registry: KnownLocalsRegistry,
  registryPath: string = getWorkspacesRegistryPath()
): Promise<void> {
  const validated = KnownLocalsRegistrySchema.parse(registry);
  const dir = dirname(registryPath);
  await mkdir(dir, { recursive: true });
  const serialized = JSON.stringify(validated, null, 2);
  const tmpPath = join(
    dir,
    `.${WORKSPACES_REGISTRY_FILENAME}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  try {
    await writeFile(tmpPath, serialized, 'utf-8');
    await rename(tmpPath, registryPath);
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Upsert by absolute path (canonical key). Same path updates `project_id` + `last_seen_at`.
 * Also drops other rows that share the same `project_id` so one project maps to one known path.
 */
export async function upsertKnownLocal(input: {
  path: string;
  project_id: string;
  last_seen_at?: string;
  registryPath?: string;
}): Promise<KnownLocalEntry> {
  const registryPath = input.registryPath ?? getWorkspacesRegistryPath();
  const absPath = resolve(input.path);
  const last_seen_at = input.last_seen_at ?? new Date().toISOString();
  const registry = loadKnownLocalsRegistry(registryPath);

  const next: KnownLocalEntry = {
    path: absPath,
    project_id: input.project_id,
    last_seen_at,
  };

  const withoutDupes = registry.workspaces.filter(
    w => w.path !== absPath && w.project_id !== input.project_id
  );
  withoutDupes.push(next);
  withoutDupes.sort((a, b) => a.path.localeCompare(b.path));

  await saveKnownLocalsRegistry(
    { schema_version: WORKSPACES_REGISTRY_SCHEMA_VERSION, workspaces: withoutDupes },
    registryPath
  );
  return next;
}

/** Entries whose path still exists on disk (cheap FS check). */
export function listKnownLocalsPresent(
  registryPath: string = getWorkspacesRegistryPath()
): KnownLocalEntry[] {
  return loadKnownLocalsRegistry(registryPath).workspaces.filter(w => existsSync(w.path));
}

/** Set of project_ids currently present in the known-locals registry (any path). */
export function knownLocalProjectIds(
  registryPath: string = getWorkspacesRegistryPath()
): Set<string> {
  return new Set(loadKnownLocalsRegistry(registryPath).workspaces.map(w => w.project_id));
}
