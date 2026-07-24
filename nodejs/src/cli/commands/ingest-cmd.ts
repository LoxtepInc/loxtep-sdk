/**
 * CLI: loxtep ingest provision — SDK connector + workflow bundle + optional deploy.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSdkIngestBundle } from '../../lib/sdk-ingest-bundle.js';
import { requireCliClient } from '../create-cli-client.js';

export interface IngestCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
  debug?: boolean;
}

export async function runIngestProvision(
  params: {
    name?: string;
    domain_id?: string;
    workflow_name?: string;
    project_id?: string;
    instance_id?: string;
    dry_run?: boolean;
    no_deploy?: boolean;
    write_bundle_file?: boolean;
  },
  options: IngestCmdOptions = {}
): Promise<void> {
  const { client, config } = await requireCliClient(options);
  const dataProductName = params.name ?? 'app-events';
  const projectId = params.project_id ?? config.project_id;
  const instanceId = (params.instance_id && params.instance_id.trim()) || config.instance_id;

  if (!projectId) {
    console.error('Missing project_id. Run `loxtep init` and attach a project first.');
    process.exitCode = 1;
    return;
  }
  if (!params.dry_run && !params.no_deploy && !instanceId) {
    console.error(
      'Missing instance_id for deploy. Pass --instance-id, run `loxtep attach`, or use --no-deploy / --dry-run.'
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

  console.error('Creating SDK connector…');
  const connector = await client.connect.connectors.create({
    connector_type: 'sdk',
    metadata: { name: 'SDK Connector', created_by: 'loxtep-ingest-provision' },
  });

  const bundle = buildSdkIngestBundle({
    organization_id: organizationId,
    project_id: projectId,
    domain_id: domainId,
    connector_id: connector.connector_id,
    data_product_name: dataProductName,
    workflow_name: params.workflow_name,
    user_id: user.user_id,
  });

  if (params.write_bundle_file !== false) {
    mkdirSync('.loxtep', { recursive: true });
    const outPath = join('.loxtep', 'sdk-ingest-bundle.json');
    writeFileSync(
      outPath,
      JSON.stringify({ project_id: projectId, files: bundle.files }, null, 2)
    );
    console.error(`Wrote bundle file: ${outPath}`);
  }

  console.error(params.dry_run ? 'Validating workflow bundle (dry run)…' : 'Saving workflow bundle…');
  const saveResult = await client.build.workflows.save_workflow_bundle(projectId, {
    files: bundle.files,
    dry_run: params.dry_run ?? false,
  });

  if (params.dry_run) {
    console.log(JSON.stringify({ ...bundle, save: saveResult }, null, 2));
    console.error(
      `Dry run passed for workflow ${saveResult.workflow_id}. Re-run without --dry-run to persist and deploy.`
    );
    return;
  }

  let deployResult: unknown;
  if (!params.no_deploy && instanceId) {
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
        workflow_id: saveResult.workflow_id,
        data_product_id: bundle.data_product_id,
        data_product_name: bundle.data_product_name,
        save: saveResult,
        deploy: deployResult,
      },
      null,
      2
    )
  );

  if (!params.no_deploy && instanceId) {
    console.error(`
Provisioned "${dataProductName}". Use get_writer('${dataProductName}') in your app (see docs/sdk-first-ingest.md).
`);
  }
}
