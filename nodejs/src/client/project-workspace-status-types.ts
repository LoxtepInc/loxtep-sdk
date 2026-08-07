/**
 * Three-layer project / workspace status payload.
 *
 * Stable snake_case contract for:
 * - CLI: `loxtep status`, enriched `loxtep projects list|get`
 * - MCP: `get_project_workspace_status` (planned)
 *
 * Layers:
 * - **local** — CWD / known-locals + `.loxtep/project.json`
 * - **cloud** — org project + Studio/S3 workspace
 * - **deployed** — instance bindings after `deploy`
 *
 * Unpublished = deltas Local→Cloud and Cloud→Deployed (not a vague draft flag).
 *
 * Cost guidance: see {@link PROJECT_WORKSPACE_STATUS_FIELD_COST} and
 * `docs/project-workspace-status.md`. Prefer `population_depth: "summary"` when
 * enriching list rows so list stays snappy.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums / scalar vocab (stable for CLI tables + MCP)
// ---------------------------------------------------------------------------

/** How deeply the producer filled the payload. */
export const StatusPopulationDepthSchema = z.enum([
  /** List-safe fields only (cheap disk + cheap cloud row columns). */
  'summary',
  /** Default for `loxtep status` / MCP get — layers + cheap/moderate deploys. */
  'status',
  /** Entity/file-level unpublished inventory (expensive). */
  'unpublished',
]);
export type StatusPopulationDepth = z.infer<typeof StatusPopulationDepthSchema>;

/** Relative cost to populate a field or nested group. */
export const PopulationCostSchema = z.enum(['cheap', 'moderate', 'expensive']);
export type PopulationCost = z.infer<typeof PopulationCostSchema>;

/** GitHub Project_Repository binding for status surfaces. */
export const GithubLinkStateSchema = z.enum(['linked', 'unbound']);
export type GithubLinkState = z.infer<typeof GithubLinkStateSchema>;

/** Whether `.loxtep/project.json` has instance_id + api_url (loxtep attach). */
export const AttachStateSchema = z.enum(['unattached', 'attached']);
export type AttachState = z.infer<typeof AttachStateSchema>;

/**
 * Deployed-layer badge.
 * - `never_deployed` — no successful deployment known
 * - `deployed` — cloud revision matches (or considered current) deployed runtime
 * - `stale` — cloud ahead of deployed (Cloud→Deployed dirty)
 * - `unknown` — not computed / API unavailable (do not invent success)
 */
export const DeployedLayerStateSchema = z.enum([
  'never_deployed',
  'deployed',
  'stale',
  'unknown',
]);
export type DeployedLayerState = z.infer<typeof DeployedLayerStateSchema>;

/**
 * Suggested next CLI/MCP action for humans and agents.
 * Distinct from runtime `observe status`.
 */
export const NextActionHintSchema = z.enum([
  'init',
  'link',
  'attach',
  'clone',
  'push',
  'deploy',
  'none',
]);
export type NextActionHint = z.infer<typeof NextActionHintSchema>;

/** Presence of a layer when the producer probed it. */
export const LayerPresenceSchema = z.enum(['present', 'absent', 'unknown']);
export type LayerPresence = z.infer<typeof LayerPresenceSchema>;

// ---------------------------------------------------------------------------
// Nested layer objects
// ---------------------------------------------------------------------------

export const LocalWorkspaceLayerSchema = z.object({
  /** Whether a local workspace was resolved (cwd walk or known-locals). */
  presence: LayerPresenceSchema,
  /** Absolute path to the project root when known. */
  path: z.string().nullable(),
  /** Absolute path to `.loxtep/project.json` when known. */
  project_file: z.string().nullable(),
  /** True when path came from `~/.loxtep/workspaces.json`. */
  known_local: z.boolean(),
  /** attach state derived from local config (instance_id + api_url). */
  attach_state: AttachStateSchema,
  instance_id: z.string().nullable(),
  api_url: z.string().nullable(),
  /** Local project_id from `.loxtep/project.json` when present. */
  project_id: z.string().nullable(),
});
export type LocalWorkspaceLayer = z.infer<typeof LocalWorkspaceLayerSchema>;

export const GithubStatusSchema = z.object({
  state: GithubLinkStateSchema,
  url: z.string().nullable(),
  name: z.string().nullable(),
  branch: z.string().nullable(),
  last_sync_at: z.string().nullable(),
});
export type GithubStatus = z.infer<typeof GithubStatusSchema>;

export const CloudProjectLayerSchema = z.object({
  presence: LayerPresenceSchema,
  project_id: z.string().nullable(),
  organization_id: z.string().nullable(),
  name: z.string().nullable(),
  /** Cloud project lifecycle status (`active` | `inactive` | `archived`). */
  status: z.string().nullable(),
  github: GithubStatusSchema,
  /**
   * Best-effort workspace / package revision marker when available
   * (e.g. last push or S3 workspace etag/sha). Null when not populated.
   */
  workspace_revision: z.string().nullable(),
  workspace_updated_at: z.string().nullable(),
});
export type CloudProjectLayer = z.infer<typeof CloudProjectLayerSchema>;

export const DeployedRuntimeLayerSchema = z.object({
  presence: LayerPresenceSchema,
  state: DeployedLayerStateSchema,
  instance_id: z.string().nullable(),
  deployment_id: z.string().nullable(),
  /** Platform deployment status string when known (pending, deployed, failed, …). */
  deployment_status: z.string().nullable(),
  /** ISO-8601 UTC of last relevant deploy event when known. */
  last_deployed_at: z.string().nullable(),
  /** Seconds since `last_deployed_at` when both clock and timestamp known. */
  age_seconds: z.number().int().nonnegative().nullable(),
});
export type DeployedRuntimeLayer = z.infer<typeof DeployedRuntimeLayerSchema>;

/** Entity kinds in the push/deploy package inventory. */
export const UnpublishedEntityKindSchema = z.enum([
  'workflow',
  'connection',
  'data_product',
  'transformation',
  'validation',
  'schema',
  'module',
]);
export type UnpublishedEntityKind = z.infer<typeof UnpublishedEntityKindSchema>;

/** How a package path differs across a layer boundary. */
export const UnpublishedChangeKindSchema = z.enum([
  'added',
  'modified',
  'removed',
  'pending_push',
  'pending_deploy',
  'cloud_only',
]);
export type UnpublishedChangeKind = z.infer<typeof UnpublishedChangeKindSchema>;

/** One actionable file/entity in an unpublished inventory. */
export const UnpublishedChangeItemSchema = z.object({
  /** Repo-relative path (e.g. `workflows/wf_1/connections/src.json`). */
  path: z.string(),
  entity_kind: UnpublishedEntityKindSchema,
  change: UnpublishedChangeKindSchema,
  workflow_id: z.string().nullable(),
  content_sha256: z.string().nullable().optional(),
});
export type UnpublishedChangeItem = z.infer<typeof UnpublishedChangeItemSchema>;

/**
 * One unpublished delta axis.
 * `dirty: null` means "not computed at this population_depth" — not "clean".
 */
export const UnpublishedDeltaSchema = z.object({
  dirty: z.boolean().nullable(),
  /** Short human/agent summary suitable for CLI one-liners. */
  summary: z.string().nullable(),
  /** Count of changed entities/files when inventory was computed. */
  changed_count: z.number().int().nonnegative().nullable(),
  /**
   * Entity/file inventory (population_depth `unpublished` only).
   * Empty at summary/status depths.
   */
  changes: z.array(UnpublishedChangeItemSchema).default([]),
});
export type UnpublishedDelta = z.infer<typeof UnpublishedDeltaSchema>;

export const UnpublishedStatusSchema = z.object({
  local_to_cloud: UnpublishedDeltaSchema,
  cloud_to_deployed: UnpublishedDeltaSchema,
});
export type UnpublishedStatus = z.infer<typeof UnpublishedStatusSchema>;

// ---------------------------------------------------------------------------
// Full status payload + list enrichment
// ---------------------------------------------------------------------------

/**
 * Full three-layer status. MCP `get_project_workspace_status` and CLI `status`
 * should return this shape (optionally wrapped in `{ success, data }`).
 */
export const ProjectWorkspaceStatusSchema = z.object({
  /** Schema version for forward-compatible clients. */
  schema_version: z.literal(1),
  population_depth: StatusPopulationDepthSchema,
  /** Canonical project_id when any layer knows it. */
  project_id: z.string().nullable(),
  display_name: z.string().nullable(),
  local: LocalWorkspaceLayerSchema,
  cloud: CloudProjectLayerSchema,
  deployed: DeployedRuntimeLayerSchema,
  unpublished: UnpublishedStatusSchema,
  next_action: NextActionHintSchema,
  /** Optional free-form notes (warnings, "deploy API unavailable", etc.). */
  notes: z.array(z.string()).default([]),
});
export type ProjectWorkspaceStatus = z.infer<typeof ProjectWorkspaceStatusSchema>;

/**
 * Lean enrichment for `projects list` / MCP `list_projects` rows.
 * All fields beyond identity are optional so producers can omit expensive ones.
 */
export const ProjectListStatusEnrichmentSchema = z.object({
  project_id: z.string(),
  name: z.string().optional(),
  local_present: z.boolean().optional(),
  local_path: z.string().nullable().optional(),
  attach_state: AttachStateSchema.optional(),
  github_state: GithubLinkStateSchema.optional(),
  deployed_state: DeployedLayerStateSchema.optional(),
  /** Local→Cloud dirty; omit or null when not computed. */
  local_to_cloud_dirty: z.boolean().nullable().optional(),
  /** Cloud→Deployed dirty; omit or null when not computed. */
  cloud_to_deployed_dirty: z.boolean().nullable().optional(),
});
export type ProjectListStatusEnrichment = z.infer<
  typeof ProjectListStatusEnrichmentSchema
>;

/** MCP / REST envelope helpers (match SDK successResponse patterns). */
export const ProjectWorkspaceStatusResponseSchema = z.object({
  success: z.literal(true),
  data: ProjectWorkspaceStatusSchema,
});
export type ProjectWorkspaceStatusResponse = z.infer<
  typeof ProjectWorkspaceStatusResponseSchema
>;

// ---------------------------------------------------------------------------
// Population cost map (implementer guide; not emitted on the wire)
// ---------------------------------------------------------------------------

/**
 * Cost of filling fields so list enrichment can stay snappy.
 *
 * - **cheap** — OK per list row (disk + columns already on project list row)
 * - **moderate** — OK for status/get (one extra call or small join)
 * - **expensive** — only for `--unpublished` / depth `unpublished`
 */
export const PROJECT_WORKSPACE_STATUS_FIELD_COST = {
  'local.presence': 'cheap',
  'local.path': 'cheap',
  'local.project_file': 'cheap',
  'local.known_local': 'cheap',
  'local.attach_state': 'cheap',
  'local.instance_id': 'cheap',
  'local.api_url': 'cheap',
  'local.project_id': 'cheap',

  'cloud.presence': 'cheap',
  'cloud.project_id': 'cheap',
  'cloud.organization_id': 'cheap',
  'cloud.name': 'cheap',
  'cloud.status': 'cheap',
  'cloud.github': 'cheap',
  'cloud.workspace_revision': 'moderate',
  'cloud.workspace_updated_at': 'moderate',

  'deployed.presence': 'moderate',
  'deployed.state': 'moderate',
  'deployed.instance_id': 'moderate',
  'deployed.deployment_id': 'moderate',
  'deployed.deployment_status': 'moderate',
  'deployed.last_deployed_at': 'moderate',
  'deployed.age_seconds': 'cheap', // derived from last_deployed_at once known

  'unpublished.local_to_cloud.dirty': 'moderate',
  'unpublished.local_to_cloud.summary': 'moderate',
  'unpublished.local_to_cloud.changed_count': 'expensive',
  'unpublished.local_to_cloud.changes': 'expensive',
  'unpublished.cloud_to_deployed.dirty': 'moderate',
  'unpublished.cloud_to_deployed.summary': 'moderate',
  'unpublished.cloud_to_deployed.changed_count': 'expensive',
  'unpublished.cloud_to_deployed.changes': 'expensive',

  next_action: 'cheap',
  notes: 'cheap',
} as const satisfies Record<string, PopulationCost>;

export type ProjectWorkspaceStatusFieldPath =
  keyof typeof PROJECT_WORKSPACE_STATUS_FIELD_COST;

/**
 * Depth → allowed cost ceiling. Producers SHOULD omit or set null for fields
 * above the ceiling rather than blocking on expensive work.
 */
export const STATUS_POPULATION_DEPTH_COST_CEILING = {
  summary: 'cheap',
  status: 'moderate',
  unpublished: 'expensive',
} as const satisfies Record<StatusPopulationDepth, PopulationCost>;
