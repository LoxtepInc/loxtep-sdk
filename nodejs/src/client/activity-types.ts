/**
 * Activity/Audit API types.
 * Canonical API: GET /ai/activity (unified read-model query).
 * snake_case per backend conventions.
 *
 * Requirements: 7.4, 18.5
 */

/** Valid source values for activity/audit entries. */
export type ActivitySource = 'cli' | 'sdk' | 'mcp' | 'ui';

/** Valid outcome values for action-trace entries. */
export type ActivityOutcome = 'succeeded' | 'failed';

/** Kind discriminator for activity entries. */
export type ActivityEntryKind = 'action_trace' | 'audit';

/** An activity or audit entry as returned by the unified read-model query (R7.4). */
export interface ActivityEntry {
  /** Stable unique id used as tie-breaker for ordering. */
  entry_id: string;
  /** Discriminator: 'action_trace' for workflow action traces, 'audit' for mutation audit. */
  kind: ActivityEntryKind;
  /** Workflow name (present on action_trace entries). */
  workflow_name?: string;
  /** Operation name. */
  operation_name: string;
  /** Target resource identifier (present on action_trace entries). */
  target_resource?: string;
  /** Actor identity (user id or agent id). */
  actor: string;
  /** Source of the operation (present on audit entries). */
  source?: ActivitySource;
  /** Resource type (present on audit entries). */
  resource_type?: string;
  /** Resource id (present on audit entries). */
  resource_id?: string;
  /** Skill name when the mutation is associated with a skill (R7.3). */
  skill_name?: string;
  /** UTC timestamp of the entry. */
  timestamp: string;
  /** Outcome of the operation (present on action_trace entries). */
  outcome?: ActivityOutcome;
}

/** Filters for listing activity entries (GET /ai/activity query params). */
export interface ActivityListFilters {
  /** Filter by source (cli, sdk, mcp, ui). */
  source?: ActivitySource;
  /** Filter by actor identity. */
  actor?: string;
  /** Filter by resource type. */
  resource_type?: string;
  /** Time-range start (UTC ISO 8601). start > end is rejected (R7.7). */
  start?: string;
  /** Time-range end (UTC ISO 8601). */
  end?: string;
  /** Max results per page (1–100, default 50). */
  limit?: number;
  /** Cursor for pagination. */
  cursor?: string;
}

/** Response shape from GET /ai/activity. */
export interface ActivityListResponse {
  success: boolean;
  data: {
    entries: ActivityEntry[];
    cursor: string | null;
  };
}
