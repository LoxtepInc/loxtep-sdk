/**
 * CLI: loxtep bundle save — persist a workflow entity bundle to the project workspace.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requireCliClient } from '../create-cli-client.js';

export interface BundleCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

function parseBundleFile(filePath: string): {
  project_id?: string;
  files: Record<string, Record<string, unknown>>;
} {
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  if (raw.files && typeof raw.files === 'object') {
    return {
      project_id: typeof raw.project_id === 'string' ? raw.project_id : undefined,
      files: raw.files as Record<string, Record<string, unknown>>,
    };
  }
  return { files: raw as Record<string, Record<string, unknown>> };
}

export async function runBundleSave(
  params: { file?: string; project_id?: string; dry_run?: boolean },
  options: BundleCmdOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const filePath = resolve(params.file ?? '.loxtep/sdk-ingest-bundle.json');
  let parsed: { project_id?: string; files: Record<string, Record<string, unknown>> };
  try {
    parsed = parseBundleFile(filePath);
  } catch (err) {
    console.error(
      `Failed to read bundle file ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exitCode = 1;
    return;
  }

  const projectId = params.project_id ?? parsed.project_id ?? config.project_id;
  if (!projectId) {
    console.error(
      'Missing project_id. Pass --project-id, include project_id in the bundle file, or run from an attached workspace.'
    );
    process.exitCode = 1;
    return;
  }

  const result = await client.build.workflows.save_workflow_bundle(projectId, {
    files: parsed.files,
    dry_run: params.dry_run ?? false,
  });

  console.log(JSON.stringify(result, null, 2));

  if (params.dry_run) {
    console.error(
      `Dry run passed for workflow ${result.workflow_id}. Re-run without --dry-run to persist.`
    );
  }
}
