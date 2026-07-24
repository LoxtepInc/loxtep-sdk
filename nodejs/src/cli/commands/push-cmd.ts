/**
 * CLI: loxtep push — upload local workflow packages to workspace S3 (save_workflow_bundle),
 * then trigger project reindex so deploy sees new workflows.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectDir } from '../project-context.js';
import { requireCliClient } from '../create-cli-client.js';

export interface PushCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
  cwd?: string;
}

function listLocalWorkflowIds(projectDir: string): string[] {
  const workflowsRoot = join(projectDir, 'workflows');
  if (!existsSync(workflowsRoot)) return [];
  return readdirSync(workflowsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(id => existsSync(join(workflowsRoot, id, 'workflow.json')));
}

function collectFlatBundle(
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
 * Push all local workflow packages via save_workflow_bundle, then reindex the project.
 */
export async function runPush(
  params: {
    project_id?: string;
    workflow_id?: string;
    dry_run?: boolean;
    skip_reindex?: boolean;
  } = {},
  options: PushCmdOptions = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const projectDir = findProjectDir(cwd) ?? cwd;
  const { client, config } = await requireCliClient(options);

  const projectId = params.project_id ?? config.project_id;
  if (!projectId) {
    console.error('Missing project_id. Run `loxtep init` and attach a project first.');
    process.exitCode = 1;
    return;
  }

  const workflowIds = params.workflow_id
    ? [params.workflow_id]
    : listLocalWorkflowIds(projectDir);

  if (workflowIds.length === 0) {
    console.error('No local workflows found under workflows/. Run ingest/transform/delivery create first.');
    process.exitCode = 1;
    return;
  }

  const results: Array<{ workflow_id: string; ok: boolean; error?: string }> = [];

  for (const workflowId of workflowIds) {
    const files = collectFlatBundle(projectDir, workflowId);
    if (params.dry_run) {
      console.error(`[dry-run] would push workflow ${workflowId} (${Object.keys(files).length} files)`);
      results.push({ workflow_id: workflowId, ok: true });
      continue;
    }

    try {
      console.error(`Pushing workflow ${workflowId}…`);
      await client.build.workflows.save_workflow_bundle(projectId, {
        files,
        dry_run: false,
      });
      results.push({ workflow_id: workflowId, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ workflow_id: workflowId, ok: false, error: message });
      console.error(`Failed to push ${workflowId}: ${message}`);
    }
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }

  let reindex: unknown;
  if (!params.dry_run && !params.skip_reindex && failed.length === 0) {
    console.error('Reindexing project workspace…');
    try {
      reindex = await client.workspace.projects.reindex(projectId);
    } catch (err) {
      console.error(
        `Warning: reindex failed (${err instanceof Error ? err.message : String(err)}). Deploy may need a moment or a manual reindex.`
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        project_id: projectId,
        pushed: results,
        reindex,
        dry_run: params.dry_run ?? false,
      },
      null,
      2
    )
  );

  if (failed.length === 0 && !params.dry_run) {
    console.error('Push complete. Next: `loxtep deploy`.');
  }
}
