/**
 * CLI: loxtep projects list | projects get <id> | projects link <id|name>
 * Projects are the platform container for workflows, connectors, and deploy targets.
 * Enriched with cheap status flags (github / local path / deployed when detectable).
 * `--source local|remote|all` uses `~/.loxtep/workspaces.json`.
 */

import { toProjectListSummary } from '../../client/list-summaries.js';
import {
  buildProjectWorkspaceStatus,
  enrichProjectListSummary,
  toProjectListStatusEnrichment,
  type LocalProjectSnapshot,
} from '../../client/project-workspace-status.js';
import type { DeployedLayerState } from '../../client/project-workspace-status-types.js';
import { pickLatestDeployment } from '../../client/deployments.js';
import type { Project } from '../../client/projects-types.js';
import { mapListSummaries, printCliListOutput } from '../cli-list-output.js';
import { requireCliClient } from '../create-cli-client.js';
import {
  knownLocalProjectIds,
  listKnownLocalsPresent,
  type KnownLocalEntry,
} from '../known-locals-registry.js';
import { tryLoadProjectConfig } from '../project-context.js';
import { runLink } from './link-cmd.js';

export type ProjectsListSource = 'all' | 'local' | 'remote';

export interface ProjectsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
  cwd?: string;
  /**
   * Filter list by known-locals registry:
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

function cwdLocalSnapshot(cwd: string): LocalProjectSnapshot | null {
  const loaded = tryLoadProjectConfig(cwd);
  if (!loaded) return null;
  return {
    project_id: loaded.project.project_id,
    path: loaded.projectDir,
    project_file: loaded.projectFilePath,
    instance_id: loaded.project.instance_id ?? null,
    api_url: loaded.project.api_url ?? null,
  };
}

async function loadDeployedByProject(
  client: Awaited<ReturnType<typeof requireCliClient>>['client']
): Promise<Map<string, DeployedLayerState>> {
  const map = new Map<string, DeployedLayerState>();
  try {
    const listed = await client.workspace.deployments.list({
      page_size: 100,
      sort_by: 'updated_at',
      sort_order: 'desc',
    });
    for (const d of listed.items) {
      if (map.has(d.project_id)) continue;
      map.set(d.project_id, d.status === 'deployed' ? 'deployed' : 'never_deployed');
    }
    for (const d of listed.items) {
      if (d.status === 'deployed') map.set(d.project_id, 'deployed');
    }
  } catch {
    // List enrichment stays snappy: omit deployed_state when unavailable.
  }
  return map;
}

export async function runProjectsList(options: ProjectsCmdOptions = {}): Promise<void> {
  const sourceResult = parseSource(options.source);
  if (typeof sourceResult === 'object' && 'error' in sourceResult) {
    console.error(sourceResult.error);
    process.exitCode = 1;
    return;
  }
  const source = sourceResult;

  const cwd = options.cwd ?? process.cwd();
  const local = cwdLocalSnapshot(cwd);
  const { client } = await requireCliClient(options);
  try {
    const result = await client.workspace.projects.list({ page_size: 100 });
    const knownIds = knownLocalProjectIds(options.registryPath);
    const knownPresent = listKnownLocalsPresent(options.registryPath);
    const filteredItems = filterBySource(result.items, source, knownIds);
    const filtered = { ...result, items: filteredItems };
    const deployed_by_project = await loadDeployedByProject(client);
    const attach_state =
      local?.instance_id && local.api_url ? ('attached' as const) : ('unattached' as const);

    const summary = mapListSummaries(filtered, project => ({
      ...toProjectListSummary(project),
      ...enrichProjectListSummary(project, {
        cwd_project_id: local?.project_id ?? null,
        cwd_path: local?.path ?? null,
        cwd_attach_state: local ? attach_state : undefined,
        deployed_by_project,
      }),
    }));
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
  const cwd = options.cwd ?? process.cwd();
  const local = cwdLocalSnapshot(cwd);
  const { client } = await requireCliClient(options);
  try {
    const project = await client.workspace.projects.get(projectId);
    let deployments = null;
    let deployments_unavailable = false;
    try {
      const listed = await client.workspace.deployments.list({
        project_id: projectId,
        page_size: 20,
        sort_by: 'updated_at',
        sort_order: 'desc',
      });
      deployments = listed.items;
    } catch {
      deployments_unavailable = true;
    }

    const localForProject = local && local.project_id === projectId ? local : null;

    const status = buildProjectWorkspaceStatus({
      population_depth: 'status',
      local: localForProject,
      cloud: project,
      deployments,
      deployments_unavailable,
    });

    const enrichment = toProjectListStatusEnrichment(status);
    const latest = deployments ? pickLatestDeployment(deployments) : null;
    console.log(
      JSON.stringify(
        {
          ...project,
          status_enrichment: enrichment,
          workspace_status: status,
          ...(latest
            ? {
                latest_deployment: {
                  deployment_id: latest.deployment_id,
                  status: latest.status,
                  updated_at: latest.updated_at,
                },
              }
            : {}),
        },
        null,
        2
      )
    );
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
