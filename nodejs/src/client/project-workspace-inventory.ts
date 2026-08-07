/**
 * Unpublished package inventory (Local→Cloud / Cloud→Deployed).
 *
 * Cheap path: discover the same bundle layout as `loxtep push`, compare to
 * `.loxtep/push-manifest.json`. Escalate with cloud workflow id set when linked.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  collectFlatBundle,
  listLocalSchemaPackageFiles,
  listLocalWorkflowIds,
  listLocalWorkflowModuleFiles,
} from './workspace-package.js';
import type {
  DeployedLayerState,
  UnpublishedChangeItem,
  UnpublishedDelta,
  UnpublishedEntityKind,
} from './project-workspace-status-types.js';

export const PUSH_MANIFEST_RELATIVE_PATH = '.loxtep/push-manifest.json';

export interface PushManifest {
  schema_version: 1;
  project_id: string;
  captured_at: string;
  /** Repo-relative path → sha256 hex of stable JSON or raw file bytes. */
  files: Record<string, string>;
}

export interface DiscoveredPackageFile {
  path: string;
  entity_kind: UnpublishedEntityKind;
  workflow_id: string | null;
  content_sha256: string;
}

/** Stable SHA-256 for JSON entities (key-sorted stringify). */
export function hashStableJson(value: unknown): string {
  const canonical = stableStringify(value);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function hashRawBytes(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function entityKindFromBundleRel(relWithinWorkflow: string): UnpublishedEntityKind {
  if (relWithinWorkflow === 'workflow.json') return 'workflow';
  if (relWithinWorkflow.startsWith('connections/')) return 'connection';
  if (relWithinWorkflow.startsWith('data-products/')) return 'data_product';
  if (relWithinWorkflow.startsWith('transformations/')) return 'transformation';
  if (relWithinWorkflow.startsWith('validations/')) return 'validation';
  return 'workflow';
}

/**
 * Discover every path that would ship on next `loxtep push` (entity packages)
 * plus schema package JSON and code-first workflow modules for deploy awareness.
 */
export function discoverLocalPackageFiles(projectDir: string): DiscoveredPackageFile[] {
  const out: DiscoveredPackageFile[] = [];

  for (const workflowId of listLocalWorkflowIds(projectDir)) {
    const files = collectFlatBundle(projectDir, workflowId);
    for (const [rel, entity] of Object.entries(files)) {
      const path = `workflows/${workflowId}/${rel}`;
      out.push({
        path,
        entity_kind: entityKindFromBundleRel(rel),
        workflow_id: workflowId,
        content_sha256: hashStableJson(entity),
      });
    }
  }

  for (const name of listLocalWorkflowModuleFiles(projectDir)) {
    const path = `workflows/${name}`;
    const abs = join(projectDir, path);
    out.push({
      path,
      entity_kind: 'module',
      workflow_id: name.replace(/\.(ts|js)$/, ''),
      content_sha256: hashRawBytes(readFileSync(abs)),
    });
  }

  for (const rel of listLocalSchemaPackageFiles(projectDir)) {
    const abs = join(projectDir, rel);
    out.push({
      path: rel,
      entity_kind: 'schema',
      workflow_id: null,
      content_sha256: hashRawBytes(readFileSync(abs)),
    });
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function readPushManifest(projectDir: string): PushManifest | null {
  const abs = join(projectDir, PUSH_MANIFEST_RELATIVE_PATH);
  if (!existsSync(abs)) return null;
  try {
    const raw = JSON.parse(readFileSync(abs, 'utf8')) as PushManifest;
    if (raw?.schema_version !== 1 || typeof raw.files !== 'object' || !raw.files) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function writePushManifest(
  projectDir: string,
  manifest: PushManifest
): void {
  const abs = join(projectDir, PUSH_MANIFEST_RELATIVE_PATH);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/** Snapshot current local package into `.loxtep/push-manifest.json`. */
export function writePushManifestFromProjectDir(
  projectDir: string,
  projectId: string,
  nowIso: string = new Date().toISOString()
): PushManifest {
  const discovered = discoverLocalPackageFiles(projectDir);
  const files: Record<string, string> = {};
  for (const f of discovered) {
    // Manifest tracks push bundle paths only (entity packages + schemas).
    // Code-first modules are deploy-only and still inventory'd but not required
    // for Local→Cloud push equality.
    if (f.entity_kind === 'module') continue;
    files[f.path] = f.content_sha256;
  }
  const manifest: PushManifest = {
    schema_version: 1,
    project_id: projectId,
    captured_at: nowIso,
    files,
  };
  writePushManifest(projectDir, manifest);
  return manifest;
}

export interface BuildLocalToCloudInventoryInput {
  projectDir: string;
  /** Cloud workflow ids when linked + API list succeeded (escalate). */
  cloud_workflow_ids?: string[] | null;
  /** When API list failed. */
  cloud_list_unavailable?: boolean;
}

/**
 * Cheap Local→Cloud inventory: local package vs last push manifest.
 * Escalates with cloud workflow presence when ids are provided.
 */
export function buildLocalToCloudInventory(
  input: BuildLocalToCloudInventoryInput
): UnpublishedDelta {
  const discovered = discoverLocalPackageFiles(input.projectDir).filter(
    f => f.entity_kind !== 'module'
  );
  const manifest = readPushManifest(input.projectDir);
  const changes: UnpublishedChangeItem[] = [];
  const localByPath = new Map(discovered.map(f => [f.path, f]));

  if (!manifest) {
    for (const f of discovered) {
      changes.push({
        path: f.path,
        entity_kind: f.entity_kind,
        change: 'pending_push',
        workflow_id: f.workflow_id,
        content_sha256: f.content_sha256,
      });
    }
  } else {
    const manifestPaths = new Set(Object.keys(manifest.files));
    for (const f of discovered) {
      const prev = manifest.files[f.path];
      if (prev == null) {
        changes.push({
          path: f.path,
          entity_kind: f.entity_kind,
          change: 'added',
          workflow_id: f.workflow_id,
          content_sha256: f.content_sha256,
        });
      } else if (prev !== f.content_sha256) {
        changes.push({
          path: f.path,
          entity_kind: f.entity_kind,
          change: 'modified',
          workflow_id: f.workflow_id,
          content_sha256: f.content_sha256,
        });
      }
    }
    for (const path of manifestPaths) {
      if (!localByPath.has(path)) {
        changes.push({
          path,
          entity_kind: entityKindFromFullPath(path),
          change: 'removed',
          workflow_id: workflowIdFromPath(path),
          content_sha256: null,
        });
      }
    }
  }

  // Escalate: cloud workflows with no local package (won't be in next push).
  if (input.cloud_workflow_ids && input.cloud_workflow_ids.length > 0) {
    const localWf = new Set(
      discovered.map(f => f.workflow_id).filter((id): id is string => !!id)
    );
    for (const id of input.cloud_workflow_ids) {
      if (!localWf.has(id)) {
        changes.push({
          path: `workflows/${id}`,
          entity_kind: 'workflow',
          change: 'cloud_only',
          workflow_id: id,
          content_sha256: null,
        });
      }
    }
  }

  changes.sort((a, b) => a.path.localeCompare(b.path));
  const dirty = changes.length > 0;
  let summary: string;
  if (!manifest && discovered.length === 0) {
    summary = 'No local package files';
  } else if (!manifest) {
    summary = `${changes.length} file(s) would push (no local push manifest yet)`;
  } else if (dirty) {
    summary = `${changes.length} unpublished Local→Cloud change(s) vs last push`;
  } else {
    summary = 'Local package matches last push manifest';
  }
  if (input.cloud_list_unavailable) {
    summary = `${summary}; cloud workflow list unavailable`;
  }

  return {
    dirty: discovered.length === 0 && !manifest ? false : dirty,
    summary,
    changed_count: changes.length,
    changes,
  };
}

export interface BuildCloudToDeployedInventoryInput {
  local_to_cloud: UnpublishedDelta;
  deployed_state: DeployedLayerState;
  cloud_to_deployed_dirty: boolean | null;
  cloud_to_deployed_summary: string | null;
  /** Local files (including modules) that would be on the next deploy story. */
  projectDir: string;
}

/**
 * Cloud→Deployed inventory. Cheap: reuse deploy-layer dirty + list pushable
 * (or deployable module) paths when cloud is ahead / never deployed.
 */
export function buildCloudToDeployedInventory(
  input: BuildCloudToDeployedInventoryInput
): UnpublishedDelta {
  const dirty = input.cloud_to_deployed_dirty;
  if (dirty === null) {
    return {
      dirty: null,
      summary: input.cloud_to_deployed_summary,
      changed_count: null,
      changes: [],
    };
  }
  if (dirty === false) {
    return {
      dirty: false,
      summary: input.cloud_to_deployed_summary ?? 'Cloud matches deployed runtime',
      changed_count: 0,
      changes: [],
    };
  }

  const changes: UnpublishedChangeItem[] = [];
  // If Local→Cloud is still dirty, cloud may not have latest — still list local
  // package as pending_deploy candidates after push.
  const packageFiles = discoverLocalPackageFiles(input.projectDir);
  for (const f of packageFiles) {
    changes.push({
      path: f.path,
      entity_kind: f.entity_kind,
      change: 'pending_deploy',
      workflow_id: f.workflow_id,
      content_sha256: f.content_sha256,
    });
  }

  const summary =
    input.cloud_to_deployed_summary ??
    (input.deployed_state === 'never_deployed'
      ? 'Never deployed'
      : 'Cloud ahead of last deploy (stale)');

  return {
    dirty: true,
    summary:
      changes.length > 0
        ? `${summary} — ${changes.length} file(s) would ship on next deploy`
        : summary,
    changed_count: changes.length,
    changes,
  };
}

function entityKindFromFullPath(path: string): UnpublishedEntityKind {
  if (path.startsWith('schemas/')) return 'schema';
  const m = path.match(/^workflows\/[^/]+\/(.+)$/);
  if (m) return entityKindFromBundleRel(m[1]!);
  if (path.startsWith('workflows/') && /\.(ts|js)$/.test(path)) return 'module';
  return 'workflow';
}

function workflowIdFromPath(path: string): string | null {
  const m = path.match(/^workflows\/([^/]+)/);
  return m?.[1] ?? null;
}

/** Pretty inventory lines for CLI text output. */
export function formatUnpublishedInventoryLines(
  local_to_cloud: UnpublishedDelta,
  cloud_to_deployed: UnpublishedDelta
): string[] {
  const lines: string[] = [];
  lines.push('— Local→Cloud —');
  lines.push(
    `  ${local_to_cloud.dirty ? 'dirty' : 'clean'}: ${local_to_cloud.summary ?? ''}`
  );
  for (const c of local_to_cloud.changes ?? []) {
    lines.push(`  [${c.change}] ${c.path} (${c.entity_kind})`);
  }
  lines.push('— Cloud→Deployed —');
  lines.push(
    `  ${
      cloud_to_deployed.dirty === null
        ? 'not computed'
        : cloud_to_deployed.dirty
          ? 'dirty'
          : 'clean'
    }: ${cloud_to_deployed.summary ?? ''}`
  );
  for (const c of cloud_to_deployed.changes ?? []) {
    lines.push(`  [${c.change}] ${c.path} (${c.entity_kind})`);
  }
  return lines;
}
