/**
 * CLI: loxtep ingest provision — reuse/create SDK connector, write local workflow package.
 * Default: local files only (no save_workflow_bundle / deploy). Use --deploy to publish.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Connector } from '../../client/connectors-types.js';
import {
  buildSdkIngestLocalPackage,
  validateSdkIngestPackageFiles,
} from '../../lib/sdk-ingest-bundle.js';
import { findProjectDir } from '../project-context.js';
import { requireCliClient } from '../create-cli-client.js';
import { formatLintResult, runLintCheck } from './lint-cmd.js';

export interface IngestCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
  cwd?: string;
}

function writePackageFiles(
  projectDir: string,
  files: Record<string, Record<string, unknown>>
): string[] {
  const written: string[] = [];
  for (const [relPath, entity] of Object.entries(files)) {
    const full = join(projectDir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `${JSON.stringify(entity, null, 2)}\n`);
    written.push(relPath);
  }
  return written;
}

export async function runIngestProvision(
  params: {
    name?: string;
    domain_id?: string;
    workflow_name?: string;
    project_id?: string;
    instance_id?: string;
    connector_id?: string;
    dry_run?: boolean;
    /** When true, after local write: save_workflow_bundle + deploy. */
    deploy?: boolean;
    /** @deprecated Default is already no deploy; kept for CLI compat. */
    no_deploy?: boolean;
  },
  options: IngestCmdOptions = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const projectDir = findProjectDir(cwd) ?? cwd;

  const { client, config } = await requireCliClient(options);
  const dataProductName = params.name ?? 'app-events';
  const projectId = params.project_id ?? config.project_id;
  const instanceId = (params.instance_id && params.instance_id.trim()) || config.instance_id;

  if (!projectId) {
    console.error('Missing project_id. Run `loxtep init` and attach a project first.');
    process.exitCode = 1;
    return;
  }
  if (!instanceId) {
    console.error(
      'Missing instance_id. Run `loxtep attach --instance <id>` or pass --instance-id.'
    );
    process.exitCode = 1;
    return;
  }

  const user = await client.session.get_current_user();
  const organizationId = user.organization_id ?? client.organization_id;
  if (!organizationId) {
    console.error('Missing organization_id in session.');
    process.exitCode = 1;
    return;
  }

  let domainId = params.domain_id;
  if (!domainId) {
    const domains = await client.define.domains.list({ page_size: 20 });
    const items = domains.items ?? [];
    if (items.length === 0) {
      console.error(
        'No domains found. Create one in the Web UI (Governance → Domains) or pass --domain-id.'
      );
      process.exitCode = 1;
      return;
    }
    domainId = items[0].domain_id;
    console.error(`Using domain: ${items[0].name} (${domainId})`);
  }

  let connector: Connector;
  let connectorReused = false;

  if (params.connector_id) {
    console.error(`Using connector ${params.connector_id}…`);
    connector = await client.connect.connectors.get(params.connector_id);
    connectorReused = true;
  } else {
    console.error('Looking up existing SDK connectors…');
    const listed = await client.connect.connectors.list({
      connector_type: 'sdk',
      page_size: 50,
    });
    const existing = (listed.items ?? []).find(c => c.connector_type === 'sdk');
    if (existing) {
      connector = existing;
      connectorReused = true;
      console.error(`Reusing SDK connector: ${connector.connector_id}`);
    } else {
      console.error('Creating SDK connector…');
      const connectorMetadata: Record<string, unknown> = {
        name: `${dataProductName} SDK`,
        created_by: 'loxtep-ingest-provision',
        project_id: projectId,
        instance_id: instanceId,
      };
      if (config.region) {
        connectorMetadata.region = config.region;
      }
      connector = await client.connect.connectors.create({
        connector_type: 'sdk',
        metadata: connectorMetadata,
      });
    }
  }

  const localConnectorPath = join(projectDir, 'connectors', `${connector.connector_id}.json`);
  const includeConnectorFile = !existsSync(localConnectorPath);

  const pkg = buildSdkIngestLocalPackage({
    organization_id: organizationId,
    project_id: projectId,
    domain_id: domainId,
    connector_id: connector.connector_id,
    data_product_name: dataProductName,
    workflow_name: params.workflow_name,
    user_id: user.user_id,
    connector,
    include_connector_file: includeConnectorFile,
  });

  const schemaErrors = validateSdkIngestPackageFiles(pkg.files);
  if (schemaErrors.length > 0) {
    console.error('Generated package failed schema validation:');
    for (const err of schemaErrors) {
      console.error(`  ${err.path}: ${err.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (params.dry_run) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          connector_id: connector.connector_id,
          connector_reused: connectorReused,
          workflow_id: pkg.workflow_id,
          data_product_id: pkg.data_product_id,
          data_product_name: pkg.data_product_name,
          files: Object.keys(pkg.files),
        },
        null,
        2
      )
    );
    console.error('Dry run OK — no files written. Re-run without --dry-run to write the local package.');
    return;
  }

  const written = writePackageFiles(projectDir, pkg.files);
  console.error(`Wrote ${written.length} local file(s):`);
  for (const p of written) {
    console.error(`  ${p}`);
  }

  const lint = runLintCheck({ cwd: projectDir, workflow_id: pkg.workflow_id });
  if (!lint.ok) {
    for (const line of formatLintResult(lint)) {
      console.error(line);
    }
    process.exitCode = 1;
    return;
  }

  const shouldDeploy = params.deploy === true && params.no_deploy !== true;

  let saveResult: unknown;
  let deployResult: unknown;

  if (shouldDeploy) {
    const flatFiles: Record<string, Record<string, unknown>> = {
      'workflow.json': pkg.files[`workflows/${pkg.workflow_id}/workflow.json`],
      [`connections/${pkg.connection_id}.json`]:
        pkg.files[`workflows/${pkg.workflow_id}/connections/${pkg.connection_id}.json`],
      [`data-products/${pkg.data_product_id}.json`]:
        pkg.files[`workflows/${pkg.workflow_id}/data-products/${pkg.data_product_id}.json`],
    };

    console.error('Saving workflow bundle…');
    saveResult = await client.build.workflows.save_workflow_bundle(projectId, {
      files: flatFiles,
      dry_run: false,
    });

    console.error('Deploying project to instance…');
    deployResult = await client.build.workflows.deploy({
      project_id: projectId,
      instance_id: instanceId,
    });
  }

  console.log(
    JSON.stringify(
      {
        connector_id: connector.connector_id,
        connector_reused: connectorReused,
        workflow_id: pkg.workflow_id,
        data_product_id: pkg.data_product_id,
        data_product_name: pkg.data_product_name,
        files: written,
        save: saveResult,
        deploy: deployResult,
      },
      null,
      2
    )
  );

  if (!shouldDeploy) {
    console.error(`
Local package ready for "${dataProductName}".
Next: \`loxtep lint\` then \`loxtep deploy\` (or re-run with --deploy).
Use get_writer('${dataProductName}') after deploy (see docs/sdk-first-ingest.md).
`);
  } else {
    console.error(`
Provisioned "${dataProductName}". Use get_writer('${dataProductName}') in your app (see docs/sdk-first-ingest.md).
`);
  }
}
