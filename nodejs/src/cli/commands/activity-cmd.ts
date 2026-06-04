/**
 * CLI: loxtep activity list [--source <s>] [--actor <a>] [--resource-type <t>] [--from <date>] [--to <date>]
 *
 * Lists activity and audit entries from the unified Activity/Audit read-model API.
 * Ordered by UTC timestamp DESC with stable entry_id tie-break.
 * Applies source/actor/resource-type/time-range filters combined with AND (R7.4).
 * Synchronous read — R18.6 carve-out.
 *
 * Requirements: 7.4, 18.5
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { ActivityListFilters, ActivitySource } from '../../client/activity-types.js';
import type { CliResult } from '../project-context.js';

const VALID_SOURCES: ActivitySource[] = ['cli', 'sdk', 'mcp', 'ui'];

export interface ActivityListOptions {
  source?: string;
  actor?: string;
  resource_type?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * Execute `loxtep activity list`.
 *
 * Lists activity and audit entries from the platform, applying optional filters.
 * Does NOT require an attached project — operates at the organization level.
 */
export async function runActivityListCommand(
  client: LoxtepClient,
  options?: ActivityListOptions
): Promise<CliResult> {
  try {
    // Validate source filter
    if (options?.source && !VALID_SOURCES.includes(options.source as ActivitySource)) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          `Invalid source filter: '${options.source}'. Must be one of: ${VALID_SOURCES.join(', ')}.`,
        ],
      };
    }

    const filters: ActivityListFilters = {};
    if (options?.source) filters.source = options.source as ActivitySource;
    if (options?.actor) filters.actor = options.actor;
    if (options?.resource_type) filters.resource_type = options.resource_type;
    if (options?.from) filters.start = options.from;
    if (options?.to) filters.end = options.to;
    if (options?.limit != null) filters.limit = options.limit;

    const result = await client.activity.list(filters);
    const { entries } = result;

    if (entries.length === 0) {
      return { exitCode: 0, stdout: ['No activity entries found.'], stderr: [] };
    }

    const lines: string[] = [];
    for (const entry of entries) {
      const kindTag = entry.kind === 'action_trace' ? 'TRACE' : 'AUDIT';
      const outcomeTag = entry.outcome ? ` [${entry.outcome}]` : '';
      const sourceTag = entry.source ? ` (${entry.source})` : '';
      lines.push(
        `${entry.timestamp}  ${kindTag}${outcomeTag}${sourceTag}  ${entry.operation_name}`
      );
      if (entry.workflow_name) {
        lines.push(`  Workflow: ${entry.workflow_name}`);
      }
      if (entry.actor) {
        lines.push(`  Actor: ${entry.actor}`);
      }
      if (entry.target_resource) {
        lines.push(`  Target: ${entry.target_resource}`);
      }
      if (entry.resource_type && entry.resource_id) {
        lines.push(`  Resource: ${entry.resource_type}/${entry.resource_id}`);
      }
      if (entry.skill_name) {
        lines.push(`  Skill: ${entry.skill_name}`);
      }
      lines.push('');
    }
    return { exitCode: 0, stdout: lines, stderr: [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [`Failed to list activity: ${message}`] };
  }
}
