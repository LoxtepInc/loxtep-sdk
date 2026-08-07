/**
 * CLI: loxtep projects list | projects get <id> | projects link <id|name>
 * Projects are the platform container for workflows, connectors, and deploy targets.
 * Phase C: `--source local|remote|all` uses `~/.loxtep/workspaces.json`.
 */

import { toProjectListSummary } from '../../client/list-summaries.js';
import type { Project } from '../../client/projects-types.js';
import { mapListSummaries, printCliListOutput } from '../cli-list-output.js';
import { requireCliClient } from '../create-cli-client.js';
import {
  knownLocalProjectIds,
  listKnownLocalsPresent,
  type KnownLocalEntry,
} from '../known-locals-registry.js';
import { runLink } from './link-cmd.js';

export type ProjectsListSource = 'all' | 'local' | 'remote';

export interface ProjectsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
  /**
   * Filter list by known-locals registry (Phase C):
   * - `all` (default): remote list unchanged
   * - `local`: only cloud projects present in `~/.loxtep/workspaces.json`
   * - `remote`: cloud projects not in the registry
   */
  source?: string;
  /** Test override for registry path. */
  registryPath?: string;
  /** Target path for `projects link` (defaults to cwd). */
  path?: string;
}

function parseSource(raw: string | undefined): ProjectsListSource | { error: string } {
  if (raw == null || raw === '') return 'all';
  const v = raw.toLowerCase();
  if (v === 'all' || v === 'local' || v === 'remote') return v;
  return { error: `Invalid --source '${raw}'. Use local | remote | all.` };
}

function filterBySource(
  items: Project[],
  source: ProjectsListSource,
  knownIds: Set<string>
): Project[] {
  if (source === 'all') return items;
  if (source === 'local') return items.filter(p => knownIds.has(p.project_id));
  return items.filter(p => !knownIds.has(p.project_id));
}

function localOnlyPlaceholders(
  source: ProjectsListSource,
  knownPresent: KnownLocalEntry[],
  cloudItems: Project[]
): Array<Record<string, unknown>> {
  if (source !== 'local') return [];
  const cloudIds = new Set(cloudItems.map(p => p.project_id));
  return knownPresent
    .filter(w => !cloudIds.has(w.project_id))
    .map(w => ({
      project_id: w.project_id,
      name: '(known local — not returned by cloud list)',
      path: w.path,
      last_seen_at: w.last_seen_at,
      source: 'local',
    }));
}

export async function runProjectsList(options: ProjectsCmdOptions = {}): Promise<void> {
  const sourceResult = parseSource(options.source);
  if (typeof sourceResult === 'object' && 'error' in sourceResult) {
    console.error(sourceResult.error);
    process.exitCode = 1;
    return;
  }
  const source = sourceResult;

  const { client } = await requireCliClient(options);
  try {
    const result = await client.workspace.projects.list({ page_size: 100 });
    const knownIds = knownLocalProjectIds(options.registryPath);
    const knownPresent = listKnownLocalsPresent(options.registryPath);
    const filteredItems = filterBySource(result.items, source, knownIds);
    const filtered = { ...result, items: filteredItems };
    const summary = mapListSummaries(filtered, toProjectListSummary);
    const extra = localOnlyPlaceholders(source, knownPresent, filteredItems);

    const payload =
      source === 'all'
        ? summary
        : {
            ...summary,
            source,
            known_locals: knownPresent.map(w => ({
              project_id: w.project_id,
              path: w.path,
              last_seen_at: w.last_seen_at,
            })),
            local_only: extra,
          };

    printCliListOutput(payload, filtered, { ...options, label: 'projects list' });
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runProjectsGet(
  projectId: string,
  options: ProjectsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const project = await client.workspace.projects.get(projectId);
    console.log(JSON.stringify(project, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runProjectsLink(
  projectRef: string,
  options: ProjectsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  const result = await runLink(client, {
    projectRef,
    path: options.path,
    registryPath: options.registryPath,
  });
  for (const line of result.stdout) console.log(line);
  for (const line of result.stderr) console.error(line);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
