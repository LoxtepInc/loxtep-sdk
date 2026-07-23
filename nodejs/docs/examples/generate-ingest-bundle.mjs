#!/usr/bin/env node
/**
 * Greenfield SDK ingest — one-shot provision via CLI (preferred) or bundle JSON for manual save.
 *
 * Run from your Loxtep workspace root (after login, init, attach):
 *
 *   pnpm exec loxtep ingest provision --name app-events
 *
 * Or generate bundle JSON only:
 *
 *   node node_modules/@loxtep/sdk/docs/examples/generate-ingest-bundle.mjs
 *   pnpm exec loxtep bundle save --dry-run
 *   pnpm exec loxtep bundle save
 */

import { LoxtepClient, buildSdkIngestBundle } from '@loxtep/sdk';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_PRODUCT_NAME = process.env.LOXTEP_DATA_PRODUCT_NAME ?? 'app-events';
const WORKFLOW_NAME = process.env.LOXTEP_WORKFLOW_NAME ?? 'SDK App Events Ingest';
const AUTO_SAVE = process.env.LOXTEP_AUTO_SAVE === '1';

async function main() {
  const client = await LoxtepClient.fromWorkspace();

  const user = await client.session.get_current_user();
  const organizationId = user.organization_id ?? client.organization_id;
  const projectId = client.project_id;
  const instanceId = client.instance_id;

  if (!organizationId || !projectId) {
    console.error(
      'Missing organization_id or project_id. Run from a workspace after `loxtep init`.'
    );
    process.exit(1);
  }
  if (!instanceId) {
    console.error('Missing instance_id. Run `loxtep attach --instance <id>` first.');
    process.exit(1);
  }

  let domainId = process.env.LOXTEP_DOMAIN_ID;
  if (!domainId) {
    const domains = await client.define.domains.list({ page_size: 20 });
    const items = domains.items ?? [];
    if (items.length === 0) {
      console.error(
        'No domains found. Create one in the Web UI (Governance → Domains) or set LOXTEP_DOMAIN_ID.'
      );
      process.exit(1);
    }
    domainId = items[0].domain_id;
    console.error(`Using domain: ${items[0].name} (${domainId})`);
  }

  console.error('Creating SDK connector…');
  const connector = await client.connect.connectors.create({
    connector_type: 'sdk',
    metadata: { name: 'SDK Connector', created_by: 'generate-ingest-bundle' },
  });

  const bundle = buildSdkIngestBundle({
    organization_id: organizationId,
    project_id: projectId,
    domain_id: domainId,
    connector_id: connector.connector_id,
    data_product_name: DATA_PRODUCT_NAME,
    workflow_name: WORKFLOW_NAME,
    user_id: user.user_id,
    workflow_id: randomUUID(),
    connection_id: randomUUID(),
    data_product_id: randomUUID(),
  });

  mkdirSync('.loxtep', { recursive: true });
  const outPath = join('.loxtep', 'sdk-ingest-bundle.json');
  writeFileSync(outPath, JSON.stringify({ project_id: projectId, files: bundle.files }, null, 2));

  console.log(
    JSON.stringify(
      {
        connector_id: connector.connector_id,
        workflow_id: bundle.workflow_id,
        data_product_id: bundle.data_product_id,
        data_product_name: bundle.data_product_name,
        bundle_path: outPath,
      },
      null,
      2
    )
  );

  if (AUTO_SAVE) {
    console.error('Saving workflow bundle (LOXTEP_AUTO_SAVE=1)…');
    const saveResult = await client.build.workflows.save_workflow_bundle(projectId, {
      files: bundle.files,
      dry_run: false,
    });
    console.error('Deploying…');
    const deployResult = await client.build.workflows.deploy({
      project_id: projectId,
      instance_id: instanceId,
    });
    console.log(JSON.stringify({ save: saveResult, deploy: deployResult }, null, 2));
    console.error(`
Provisioned. Write events:
  LOXTEP_DATA_PRODUCT_NAME=${DATA_PRODUCT_NAME} node node_modules/@loxtep/sdk/docs/examples/write-events.mjs
`);
    return;
  }

  console.error(`
Next steps (no MCP required)
────────────────────────────
Preferred — one command:
  pnpm exec loxtep ingest provision --name ${DATA_PRODUCT_NAME}

Or save the generated bundle:
  pnpm exec loxtep bundle save --dry-run --file ${outPath}
  pnpm exec loxtep bundle save --file ${outPath}
  pnpm exec loxtep workflows deploy --project-id ${projectId} --instance-id ${instanceId}

Write events:
  LOXTEP_DATA_PRODUCT_NAME=${DATA_PRODUCT_NAME} node node_modules/@loxtep/sdk/docs/examples/write-events.mjs
`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
