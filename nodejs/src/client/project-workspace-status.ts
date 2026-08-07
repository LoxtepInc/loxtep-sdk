/**
 * Project workspace status producer + rendering.
 *
 * Builds {@link ProjectWorkspaceStatus} from cwd-local config, cloud project row,
 * and optional deployments list. List enrichment stays at `summary` cost ceiling.
 * Local→Cloud dirty prefers push-manifest compare (same discovery as `loxtep push`).
 */

import type { Project } from './projects-types.js';
import type { Deployment } from './deployments-types.js';
import { pickLatestDeployment } from './deployments.js';
import {
  buildCloudToDeployedInventory,
  buildLocalToCloudInventory,
} from './project-workspace-inventory.js';
import type {
  AttachState,
  DeployedLayerState,
  GithubLinkState,
  NextActionHint,
  ProjectListStatusEnrichment,
  ProjectWorkspaceStatus,
  StatusPopulationDepth,
  UnpublishedChangeItem,
  UnpublishedDelta,
} from './project-workspace-status-types.js';
import { ProjectWorkspaceStatusSchema } from './project-workspace-status-types.js';

export interface LocalProjectSnapshot {
  project_id: string;
  path: string;
  project_file: string;
  instance_id: string | null;
  api_url: string | null;
}

export interface BuildProjectWorkspaceStatusInput {
  population_depth?: StatusPopulationDepth;
  /** Absolute or relative cwd used for local resolution. */
  cwd?: string;
  local?: LocalProjectSnapshot | null;
  cloud?: Project | null;
  /** When provided, used for deployed layer (status depth). Empty array = never deployed. */
  deployments?: Deployment[] | null;
  /** True when deployments probe failed (use unknown + note). */
  deployments_unavailable?: boolean;
  /** Override clock for age_seconds (tests). */
  now_ms?: number;
  /**
   * Test override for Local→Cloud dirty.
   * When unset, uses push-manifest inventory against `local.path`.
   */
  local_git_dirty?: boolean | null;
  /** Precomputed Local→Cloud inventory (status --unpublished / projects changes). */
  local_to_cloud_inventory?: UnpublishedDelta | null;
  /** Cloud workflow ids for inventory escalate (optional). */
  cloud_workflow_ids?: string[] | null;
  cloud_list_unavailable?: boolean;
  notes?: string[];
  /** True when path came from `~/.loxtep/workspaces.json`. */
  known_local?: boolean;
}

function attachStateFromLocal(local: LocalProjectSnapshot | null | undefined): AttachState {
  if (!local) return 'unattached';
  return local.instance_id && local.api_url ? 'attached' : 'unattached';
}

export function githubStateFromProject(project: Project | null | undefined): GithubLinkState {
  if (project?.github_repo_url || project?.github_repo_name) return 'linked';
  return 'unbound';
}

export function deriveNextAction(input: {
  local_present: boolean;
  attach_state: AttachState;
  github_state: GithubLinkState;
  deployed_state: DeployedLayerState;
  local_to_cloud_dirty: boolean | null;
  cloud_to_deployed_dirty: boolean | null;
}): NextActionHint {
  // No local bind yet → prefer `clone` (or `link` if the tree already exists).
  if (!input.local_present) return 'clone';
  if (input.attach_state === 'unattached') return 'attach';
  if (input.github_state === 'unbound' && input.local_to_cloud_dirty === true) return 'push';
  if (input.local_to_cloud_dirty === true) return 'push';
  if (input.deployed_state === 'never_deployed' || input.cloud_to_deployed_dirty === true) {
    return 'deploy';
  }
  if (input.deployed_state === 'stale') return 'deploy';
  return 'none';
}

function ageSeconds(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

function resolveDeployedLayer(input: {
  deployments: Deployment[] | null | undefined;
  deployments_unavailable: boolean;
  attached_instance_id: string | null;
  cloud: Project | null | undefined;
  local_to_cloud_dirty: boolean | null;
  now_ms: number;
}): {
  presence: 'present' | 'absent' | 'unknown';
  state: DeployedLayerState;
  instance_id: string | null;
  deployment_id: string | null;
  deployment_status: string | null;
  last_deployed_at: string | null;
  age_seconds: number | null;
  cloud_to_deployed_dirty: boolean | null;
  cloud_to_deployed_summary: string | null;
} {
  if (input.deployments_unavailable) {
    return {
      presence: 'unknown',
      state: 'unknown',
      instance_id: input.attached_instance_id,
      deployment_id: null,
      deployment_status: null,
      last_deployed_at: null,
      age_seconds: null,
      cloud_to_deployed_dirty: null,
      cloud_to_deployed_summary: 'Deploy API unavailable',
    };
  }
  if (input.deployments == null) {
    return {
      presence: 'unknown',
      state: 'unknown',
      instance_id: input.attached_instance_id,
      deployment_id: null,
      deployment_status: null,
      last_deployed_at: null,
      age_seconds: null,
      cloud_to_deployed_dirty: null,
      cloud_to_deployed_summary: null,
    };
  }

  const latest = pickLatestDeployment(input.deployments);
  if (!latest || latest.status !== 'deployed') {
    const pending = latest && latest.status !== 'deployed' ? latest : null;
    return {
      presence: 'absent',
      state: 'never_deployed',
      instance_id: input.attached_instance_id,
      deployment_id: pending?.deployment_id ?? null,
      deployment_status: pending?.status ?? null,
      last_deployed_at: null,
      age_seconds: null,
      cloud_to_deployed_dirty: true,
      cloud_to_deployed_summary: 'Never deployed',
    };
  }

  const last_deployed_at = latest.updated_at || latest.created_at || null;
  const syncAt = input.cloud?.github_last_sync_at ?? null;
  const syncMs = syncAt ? Date.parse(syncAt) : NaN;
  const deployMs = last_deployed_at ? Date.parse(last_deployed_at) : NaN;
  const syncNewer =
    !Number.isNaN(syncMs) && !Number.isNaN(deployMs) ? syncMs > deployMs + 1000 : false;

  const stale = syncNewer;
  const cloud_to_deployed_dirty = stale;
  return {
    presence: 'present',
    state: stale ? 'stale' : 'deployed',
    instance_id: latest.instance_id ?? input.attached_instance_id,
    deployment_id: latest.deployment_id,
    deployment_status: latest.status,
    last_deployed_at,
    age_seconds: ageSeconds(last_deployed_at, input.now_ms),
    cloud_to_deployed_dirty,
    cloud_to_deployed_summary: stale
      ? 'Cloud ahead of last deploy (stale)'
      : 'Deployed matches known cloud revision',
  };
}

function resolveLocalToCloud(input: {
  depth: StatusPopulationDepth;
  local: LocalProjectSnapshot | null;
  local_git_dirty: boolean | null | undefined;
  local_to_cloud_inventory: UnpublishedDelta | null | undefined;
  cloud_workflow_ids: string[] | null | undefined;
  cloud_list_unavailable: boolean;
}): {
  dirty: boolean | null;
  summary: string | null;
  changed_count: number | null;
  changes: UnpublishedChangeItem[];
} {
  if (input.depth !== 'status' && input.depth !== 'unpublished') {
    return { dirty: null, summary: null, changed_count: null, changes: [] };
  }

  if (input.local_to_cloud_inventory) {
    const inv = input.local_to_cloud_inventory;
    return {
      dirty: inv.dirty,
      summary: inv.summary,
      changed_count: inv.changed_count,
      changes: input.depth === 'unpublished' ? (inv.changes ?? []) : [],
    };
  }

  // Explicit test override (legacy name: local_git_dirty).
  if (input.local_git_dirty !== undefined && input.local_git_dirty !== null) {
    return {
      dirty: input.local_git_dirty,
      summary: input.local_git_dirty
        ? 'Local package has unpublished changes'
        : 'Local package clean',
      changed_count: null,
      changes: [],
    };
  }

  if (!input.local?.path) {
    return { dirty: null, summary: null, changed_count: null, changes: [] };
  }

  const inv = buildLocalToCloudInventory({
    projectDir: input.local.path,
    cloud_workflow_ids: input.cloud_workflow_ids,
    cloud_list_unavailable: input.cloud_list_unavailable,
  });
  return {
    dirty: inv.dirty,
    summary: inv.summary,
    changed_count: input.depth === 'unpublished' ? inv.changed_count : null,
    changes: input.depth === 'unpublished' ? (inv.changes ?? []) : [],
  };
}

/**
 * Pure builder for {@link ProjectWorkspaceStatus}. Callers supply already-loaded
 * local/cloud/deployments so this stays unit-testable without IO.
 */
export function buildProjectWorkspaceStatus(
  input: BuildProjectWorkspaceStatusInput
): ProjectWorkspaceStatus {
  const depth: StatusPopulationDepth = input.population_depth ?? 'status';
  const now_ms = input.now_ms ?? Date.now();
  const notes = [...(input.notes ?? [])];
  const local = input.local ?? null;
  const cloud = input.cloud ?? null;

  const attach_state = attachStateFromLocal(local);
  const github_state = githubStateFromProject(cloud);

  const l2c = resolveLocalToCloud({
    depth,
    local,
    local_git_dirty: input.local_git_dirty,
    local_to_cloud_inventory: input.local_to_cloud_inventory,
    cloud_workflow_ids: input.cloud_workflow_ids,
    cloud_list_unavailable: input.cloud_list_unavailable === true,
  });

  const deployedLayer =
    depth === 'summary'
      ? {
          presence: 'unknown' as const,
          state: 'unknown' as const,
          instance_id: local?.instance_id ?? null,
          deployment_id: null,
          deployment_status: null,
          last_deployed_at: null,
          age_seconds: null,
          cloud_to_deployed_dirty: null as boolean | null,
          cloud_to_deployed_summary: null as string | null,
        }
      : resolveDeployedLayer({
          deployments: input.deployments,
          deployments_unavailable: input.deployments_unavailable === true,
          attached_instance_id: local?.instance_id ?? null,
          cloud,
          local_to_cloud_dirty: l2c.dirty,
          now_ms,
        });

  if (input.deployments_unavailable) {
    notes.push('Deployments list unavailable; deployed layer marked unknown.');
  }

  let c2d_changed_count: number | null = null;
  let c2d_changes: UnpublishedChangeItem[] = [];
  let c2d_summary = deployedLayer.cloud_to_deployed_summary;
  let c2d_dirty = deployedLayer.cloud_to_deployed_dirty;

  if (depth === 'unpublished' && local?.path) {
    const inv = buildCloudToDeployedInventory({
      local_to_cloud: {
        dirty: l2c.dirty,
        summary: l2c.summary,
        changed_count: l2c.changed_count,
        changes: l2c.changes,
      },
      deployed_state: deployedLayer.state,
      cloud_to_deployed_dirty: deployedLayer.cloud_to_deployed_dirty,
      cloud_to_deployed_summary: deployedLayer.cloud_to_deployed_summary,
      projectDir: local.path,
    });
    c2d_dirty = inv.dirty;
    c2d_summary = inv.summary;
    c2d_changed_count = inv.changed_count;
    c2d_changes = inv.changes ?? [];
  }

  const next_action = deriveNextAction({
    local_present: local != null,
    attach_state,
    github_state,
    deployed_state: deployedLayer.state,
    local_to_cloud_dirty: l2c.dirty,
    cloud_to_deployed_dirty: c2d_dirty,
  });

  const status: ProjectWorkspaceStatus = {
    schema_version: 1,
    population_depth: depth,
    project_id: cloud?.project_id ?? local?.project_id ?? null,
    display_name: cloud?.name ?? null,
    local: {
      presence: local ? 'present' : 'absent',
      path: local?.path ?? null,
      project_file: local?.project_file ?? null,
      known_local: input.known_local === true || local != null,
      attach_state,
      instance_id: local?.instance_id ?? null,
      api_url: local?.api_url ?? null,
      project_id: local?.project_id ?? null,
    },
    cloud: {
      presence: cloud ? 'present' : local ? 'unknown' : 'absent',
      project_id: cloud?.project_id ?? null,
      organization_id: cloud?.organization_id ?? null,
      name: cloud?.name ?? null,
      status: cloud?.status ?? null,
      github: {
        state: github_state,
        url: cloud?.github_repo_url ?? null,
        name: cloud?.github_repo_name ?? null,
        branch: cloud?.github_branch ?? cloud?.repository_branch ?? null,
        last_sync_at: cloud?.github_last_sync_at ?? null,
      },
      workspace_revision: cloud?.github_last_commit_sha ?? null,
      workspace_updated_at: cloud?.updated_at ?? null,
    },
    deployed: {
      presence: deployedLayer.presence,
      state: deployedLayer.state,
      instance_id: deployedLayer.instance_id,
      deployment_id: deployedLayer.deployment_id,
      deployment_status: deployedLayer.deployment_status,
      last_deployed_at: deployedLayer.last_deployed_at,
      age_seconds: deployedLayer.age_seconds,
    },
    unpublished: {
      local_to_cloud: {
        dirty: l2c.dirty,
        summary: l2c.summary,
        changed_count: l2c.changed_count,
        changes: l2c.changes,
      },
      cloud_to_deployed: {
        dirty: c2d_dirty,
        summary: c2d_summary,
        changed_count: c2d_changed_count,
        changes: c2d_changes,
      },
    },
    next_action,
    notes,
  };

  return ProjectWorkspaceStatusSchema.parse(status);
}

/** Lean list/get row enrichment from a full (or summary) status payload. */
export function toProjectListStatusEnrichment(
  status: ProjectWorkspaceStatus
): ProjectListStatusEnrichment {
  return {
    project_id: status.project_id ?? status.local.project_id ?? '',
    ...(status.display_name ? { name: status.display_name } : {}),
    local_present: status.local.presence === 'present',
    local_path: status.local.path,
    attach_state: status.local.attach_state,
    github_state: status.cloud.github.state,
    ...(status.deployed.state !== 'unknown' ? { deployed_state: status.deployed.state } : {}),
    local_to_cloud_dirty: status.unpublished.local_to_cloud.dirty,
    cloud_to_deployed_dirty: status.unpublished.cloud_to_deployed.dirty,
  };
}

/**
 * Cheap list-row enrichment without a per-project deploy call.
 * Marks local when `cwd_project_id` matches or when present in known-locals;
 * github from project columns. `deployed_state` only when provided in
 * `deployed_by_project`.
 */
export function enrichProjectListSummary(
  project: Project,
  opts: {
    cwd_project_id?: string | null;
    cwd_path?: string | null;
    cwd_attach_state?: AttachState;
    deployed_by_project?: Map<string, DeployedLayerState>;
    /** project_id → absolute path from `~/.loxtep/workspaces.json`. */
    known_local_paths?: Map<string, string>;
  } = {}
): ProjectListStatusEnrichment {
  const knownPath = opts.known_local_paths?.get(project.project_id);
  const cwdMatch =
    !!opts.cwd_project_id && opts.cwd_project_id === project.project_id;
  const local_present = cwdMatch || knownPath != null;
  const local_path = cwdMatch ? (opts.cwd_path ?? knownPath ?? null) : (knownPath ?? null);
  return {
    project_id: project.project_id,
    name: project.name,
    local_present,
    local_path,
    ...(cwdMatch && opts.cwd_attach_state ? { attach_state: opts.cwd_attach_state } : {}),
    github_state: githubStateFromProject(project),
    ...(opts.deployed_by_project?.has(project.project_id)
      ? { deployed_state: opts.deployed_by_project.get(project.project_id) }
      : {}),
  };
}

/** One-screen human rendering for `loxtep status` (not observe status). */
export function formatProjectWorkspaceStatusLines(status: ProjectWorkspaceStatus): string[] {
  const id = status.project_id ?? '(unknown)';
  const name = status.display_name ?? '(unnamed)';
  const attach = status.local.attach_state;
  const host = status.local.api_url ?? '(no api_url)';
  const instance = status.local.instance_id ?? '(none)';
  const github = status.cloud.github.state;
  const deployLabel =
    status.deployed.state === 'never_deployed'
      ? 'never deployed'
      : status.deployed.state === 'stale'
        ? `deployed (stale)${status.deployed.last_deployed_at ? ` @ ${status.deployed.last_deployed_at}` : ''}`
        : status.deployed.state === 'deployed'
          ? `deployed${status.deployed.last_deployed_at ? ` @ ${status.deployed.last_deployed_at}` : ''}`
          : 'deploy unknown';

  const l2c = status.unpublished.local_to_cloud;
  const c2d = status.unpublished.cloud_to_deployed;
  const l2cText =
    l2c.dirty === null
      ? 'not computed'
      : l2c.dirty
        ? `dirty — ${l2c.summary ?? 'yes'}${l2c.changed_count != null ? ` (${l2c.changed_count})` : ''}`
        : 'clean';
  const c2dText =
    c2d.dirty === null
      ? 'not computed'
      : c2d.dirty
        ? `dirty — ${c2d.summary ?? 'yes'}${c2d.changed_count != null ? ` (${c2d.changed_count})` : ''}`
        : 'clean';

  const lines = [
    `Project: ${name} (${id})`,
    `Local:   ${status.local.presence}${status.local.path ? ` @ ${status.local.path}` : ''}`,
    `Attach:  ${attach}  instance=${instance}`,
    `API:     ${host}`,
    `GitHub:  ${github}${status.cloud.github.url ? ` (${status.cloud.github.url})` : ''}`,
    `Deploy:  ${deployLabel}`,
    `Unpublished Local→Cloud:   ${l2cText}`,
    `Unpublished Cloud→Deployed: ${c2dText}`,
    `Next:    ${status.next_action}`,
  ];
  if (status.population_depth === 'unpublished') {
    for (const c of l2c.changes ?? []) {
      lines.push(`  L→C [${c.change}] ${c.path} (${c.entity_kind})`);
    }
    for (const c of c2d.changes ?? []) {
      lines.push(`  C→D [${c.change}] ${c.path} (${c.entity_kind})`);
    }
  }
  if (status.notes.length > 0) {
    lines.push(`Notes:   ${status.notes.join('; ')}`);
  }
  return lines;
}
